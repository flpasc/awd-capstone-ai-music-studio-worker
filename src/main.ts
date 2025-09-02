import path from "node:path";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import express from "express";
import { z } from 'zod';
import { S3Client } from "@aws-sdk/client-s3";
import { S3Store } from "./utils/s3store";
import { createS3SlideShow, S3SlideShowOptions } from "./utils/videoCombine.s3";

const env = process.env.NODE_ENV || "development";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });
dotenv.config({
    path: path.resolve(process.cwd(), ".env.local"),
    override: true,
});

const app = express();
app.use(express.json());

const envSchema = z.object({
    S3_REGION: z.string().min(1, 'S3_REGION is required'),
    S3_ENDPOINT_URL: z.url('S3_ENDPOINT_URL must be a valid URL'),
    S3_ACCESS_KEY_ID: z.string().min(1, 'S3_ACCESS_KEY_ID is required'),
    S3_SECRET_ACCESS_KEY: z.string().min(1, 'S3_SECRET_ACCESS_KEY is required'),
    S3_FORCE_PATH_STYLE: z.string().optional().default('true'),
    S3_BUCKET_NAME: z.string().min(1, 'S3_BUCKET_NAME is required'),
    PORT: z.string().optional().default('3000').transform((val) => parseInt(val, 10)),
    TASK_STATUS_WEBHOOK_URL: z.url().optional()
});

export const config = envSchema.parse(process.env);

const s3 = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT_URL,
    forcePathStyle: config.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY
    }
});

const s3Store = new S3Store({
    client: s3,
    bucketName: config.S3_BUCKET_NAME
});

const tasks = new Map();

function createTask(taskId: string, status: Task['status'], objectName: string, fields: Partial<Omit<Task, 'status' | 'createdAt' | 'updatedAt'>> = {}) {
    tasks.set(taskId, { status, objectName, progress: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...fields });
    notifyTaskStatus(taskId);
}
function updateTask(taskId: string, fields: Partial<Omit<Task, 'createdAt' | 'updatedAt'>>) {
    const task = tasks.get(taskId);
    if (task) {
        tasks.set(taskId, { ...task, ...fields, updatedAt: new Date().toISOString() });
        notifyTaskStatus(taskId);
    } else {
        throw new Error(`Task with ID ${taskId} not found`);
    }
}

function notifyTaskStatus(taskId: string) {
    const task = tasks.get(taskId);
    if (task && config.TASK_STATUS_WEBHOOK_URL) {
        fetch(`${config.TASK_STATUS_WEBHOOK_URL}/${taskId}`, {
            method: 'POST',
            body: JSON.stringify(task),
        }).catch((error) => {
            console.error("Error notifying task status webhook:", error);
        });
    }
}

app.post("/tasks", async (req: express.Request, res: express.Response) => {
    const {
        imageUrls,
        imageTimings,
        audioUrls,
        audioTimings,
        outputVideoKey,
    } = req.body;

    const videoRequestSchema = z.object({
        imageUrls: z.array(z.string()),
        imageTimings: z.array(z.number().min(1)),
        audioUrls: z.array(z.string()),
        audioTimings: z.array(z.number().min(1)),
        outputVideoKey: z.string().min(1).max(1024)
    })
        .refine((data) => {
            const parts = data.outputVideoKey.split('/')
            return parts.length >= 2 && parts[0].length > 0 && parts[0] !== '..'
        }, {
            message: "outputVideoKey must not be in a root folder",
            path: ["outputVideoKey"]
        })
        .refine((data) => data.imageUrls.length === data.imageTimings.length, {
            message: "imageUrls and imageTimings must have the same length",
            path: ["imageTimings"]
        })
        .refine((data) => data.audioUrls.length === data.audioTimings.length, {
            message: "audioUrls and audioTimings must have the same length",
            path: ["audioTimings"]
        });

    const validationResult = videoRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
        return res.status(400).json({ error: z.treeifyError(validationResult.error) });
    }

    const taskId = randomUUID();
    const objectName = outputVideoKey;

    const slideShowOptions: S3SlideShowOptions = {
        imageFiles: imageUrls,
        audioFiles: audioUrls,
        imageTimings,
        audioTimings,
        // transitionDuration: 1;
        outputVideoKey
    };
    let taskPromise;
    try {
        taskPromise = createS3SlideShow(s3Store, slideShowOptions);
        createTask(taskId, "processing", objectName);
        res.setHeader("Location", `/tasks/${taskId}`);
        res.status(201).json({ taskId, objectName });
    } catch (error) {
        createTask(taskId, "error", objectName, { error });
        console.error("Error creating S3 slideshow:", error);
        return res.status(500).json({ error: "Failed to create slideshow" });
    }

    try {
        const etag = await taskPromise;
        updateTask(taskId, { status: "done", etag });
    } catch (error) {
        updateTask(taskId, { status: "error", error });
        console.error("Error creating S3 slideshow:", error);
    }
});

app.get("/tasks/:taskId", (req, res) => {
    const task = tasks.get(req.params.taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
});

app.listen(config.PORT, () => console.log(`Server started on http://localhost:${config.PORT}`));
