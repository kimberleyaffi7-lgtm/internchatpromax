import "dotenv/config";

const required = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 8080),
  publicOrigin: required("PUBLIC_ORIGIN", "http://localhost:8080"),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),
  s3Endpoint: required("S3_ENDPOINT"),
  s3PublicEndpoint: required("S3_PUBLIC_ENDPOINT", process.env.S3_ENDPOINT),
  s3Region: required("S3_REGION", "us-east-1"),
  s3Bucket: required("S3_BUCKET"),
  s3AccessKey: required("S3_ACCESS_KEY"),
  s3SecretKey: required("S3_SECRET_KEY"),
  jwtSecret: required("JWT_SECRET"),
  encryptionKey: required("ENCRYPTION_KEY"),
  maxFileSize: Number(process.env.MAX_FILE_SIZE_MB ?? 350) * 1024 * 1024,
  cookieSecure: process.env.COOKIE_SECURE === "true",
  cookieSameSite: (process.env.COOKIE_SAME_SITE ?? "lax") as "lax" | "strict" | "none",
  uploadPartSize: Number(process.env.UPLOAD_PART_SIZE_MB ?? 16) * 1024 * 1024
};
