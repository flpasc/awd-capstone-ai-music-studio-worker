import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { createLogger } from "./logger";
import * as fs from "fs";
import * as path from "path";

const logger = createLogger("s3", 2);

export interface S3StoreConfig {
    client: S3Client;
    bucketName: string;
}

export interface S3UploadOptions {
    contentType?: string;
    metadata?: Record<string, string>;
}

export class S3Store {
    private client: S3Client;
    private defaultBucketName: string;

    constructor(config: S3StoreConfig) {
        this.client = config.client;
        this.defaultBucketName = config.bucketName;
    }

    // Check if bucket exists
    async headBucket(bucketName?: string): Promise<void> {
        const bucket = bucketName || this.defaultBucketName;
        try {
            await this.client.send(new HeadBucketCommand({
                Bucket: bucket
            }));
            logger.trace(`Bucket exists: ${bucket}`);
        } catch (err) {
            logger.error("Bucket does not exist:", err);
            throw new Error(`Bucket does not exist: ${bucket}`);
        }
    }

    // Create bucket
    async createBucket(bucketName?: string): Promise<void> {
        const bucket = bucketName || this.defaultBucketName;
        try {
            await this.client.send(new CreateBucketCommand({
                Bucket: bucket
            }));
            logger.trace(`Bucket created: ${bucket}`);
        } catch (err) {
            logger.error("Error creating bucket:", err);
            throw new Error(`Error creating bucket: ${bucket}`);
        }
    }

    // Upload file
    async uploadFile(key: string, body: string | Buffer, options?: S3UploadOptions & { bucketName?: string }): Promise<void> {
        const bucket = options?.bucketName || this.defaultBucketName;
        
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: options?.contentType,
            Metadata: options?.metadata
        });

        await this.client.send(command);
        logger.trace(`File uploaded: ${key} to bucket: ${bucket}`);
    }

    async uploadFolder(sourceFolderPath: string, destinationFolderPath: string, bucketName?: string): Promise<void> {
        const bucket = bucketName || this.defaultBucketName;
        
        try {
            // Check if source folder exists
            if (!fs.existsSync(sourceFolderPath)) {
                throw new Error(`Source folder does not exist: ${sourceFolderPath}`);
            }

            // Get all files recursively
            const files = this.getAllFiles(sourceFolderPath);
            
            logger.trace(`Uploading ${files.length} files from ${sourceFolderPath} to ${destinationFolderPath} in bucket: ${bucket}`);

            // Upload each file
            for (const filePath of files) {
                const relativePath = path.relative(sourceFolderPath, filePath);
                const s3Key = path.posix.join(destinationFolderPath, relativePath).replace(/\\/g, '/');
                
                const fileContent = fs.readFileSync(filePath);
                const contentType = this.getContentType(filePath);
                
                await this.uploadFile(s3Key, fileContent, {
                    contentType,
                    bucketName: bucket
                });
                
                logger.trace(`Uploaded: ${relativePath} -> ${s3Key}`);
            }
            
            logger.trace(`Folder upload completed: ${sourceFolderPath} -> ${destinationFolderPath}`);
        } catch (err) {
            logger.error(`Error uploading folder: ${sourceFolderPath}`, err);
            throw new Error(`Error uploading folder: ${sourceFolderPath}`);
        }
    }


    async getFileStream(fileKey: string, bucketName?: string): Promise<Readable> {
        const bucket = bucketName || this.defaultBucketName;

        const response = await this.client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: fileKey
        }));

        if (!response?.Body) {
            logger.error(`File not found: ${fileKey} in bucket: ${bucket}`);
            throw new Error(`File not found: ${fileKey}`);
        }

        return response.Body as Readable;
    }

    // Upload buffer to S3
    async uploadBuffer(fileKey: string, buffer: Buffer, contentType?: string, bucketName?: string): Promise<void> {
        const bucket = bucketName || this.defaultBucketName;

        try {
            await this.client.send(new PutObjectCommand({
                Bucket: bucket,
                Key: fileKey,
                Body: buffer,
                ContentType: contentType || 'application/octet-stream'
            }));
            logger.trace(`Buffer uploaded successfully: ${fileKey} (${buffer.length} bytes)`);
        } catch (err) {
            logger.error(`Error uploading buffer: ${fileKey}`, err);
            throw new Error(`Failed to upload buffer: ${fileKey}`);
        }
    }

    // Read file
    async readFile(fileKey: string, bucketName?: string): Promise<string> {
        const bucket = bucketName || this.defaultBucketName;
        
        const response = await this.client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: fileKey
        }));

        if (!response?.Body) {
            logger.error(`File not found: ${fileKey} in bucket: ${bucket}`);
            throw new Error(`File not found: ${fileKey}`);
        }

        try {
            const body = await this.streamToString(response.Body as Readable);
            logger.trace(`File read: ${fileKey} from bucket: ${bucket}`);
            return body;
        } catch (err) {
            logger.error(`Error reading file: ${fileKey}`, err);
            throw new Error(`Error reading file: ${fileKey}`);
        }
    }

    // Get default bucket name
    getDefaultBucketName(): string {
        return this.defaultBucketName;
    }

    // Set default bucket name
    setDefaultBucketName(bucketName: string): void {
        this.defaultBucketName = bucketName;
    }

    // Helper method to convert stream to string
    private streamToString(stream: Readable): Promise<string> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            stream.on("data", (chunk: Buffer) => chunks.push(chunk));
            stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
            stream.on("error", reject);
        });
    }

    // Helper method to get all files recursively
    private getAllFiles(dirPath: string): string[] {
        const files: string[] = [];
        
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                files.push(...this.getAllFiles(fullPath));
            } else {
                files.push(fullPath);
            }
        }
        
        return files;
    }

    // Helper method to determine content type based on file extension
    private getContentType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes: Record<string, string> = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.txt': 'text/plain',
            '.pdf': 'application/pdf',
            '.zip': 'application/zip',
            '.xml': 'application/xml'
        };
        
        return contentTypes[ext] || 'application/octet-stream';
    }
}
