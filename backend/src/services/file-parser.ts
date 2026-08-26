import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { downloadObject } from "./storage.js";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as tar from "tar";

const textExt = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "xml",
  "yaml",
  "yml",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "java",
  "go",
  "rs",
  "php",
  "html",
  "css",
  "sql",
  "sh",
  "env",
  "toml",
  "ini",
  "conf",
  "log"
]);

const ignored =
  /(^|\/)(node_modules|\.git|dist|build|coverage|\.next|vendor)(\/|$)/i;

const MAX_EXTRACTED = 1024 * 1024 * 1024;
const MAX_FILES = 20000;

function safeName(name: string) {
  return path
    .basename(name)
    .replace(/[^\w.\- ]+/g, "_")
    .slice(0, 200);
}

async function collectFiles(
  dir: string
): Promise<string[]> {
  const out: string[] = [];

  const walk = async (d: string) => {
    for (const e of await fs.readdir(d, {
      withFileTypes: true
    })) {
      const p = path.join(d, e.name);

      if (e.isSymbolicLink()) continue;

      if (e.isDirectory()) {
        if (!ignored.test(p)) {
          await walk(p);
        }
      } else if (
        e.isFile() &&
        !ignored.test(p)
      ) {
        out.push(p);
      }

      if (out.length > MAX_FILES) {
        throw new Error(
          "Archive contains too many files"
        );
      }
    }
  };

  await walk(dir);

  return out;
}

function chunks(
  text: string,
  size = 6000,
  overlap = 500
) {
  const result: string[] = [];
  let i = 0;

  while (i < text.length) {
    const end = Math.min(
      text.length,
      i + size
    );

    result.push(text.slice(i, end));

    if (end === text.length) {
      break;
    }

    i = end - overlap;
  }

  return result;
}

export async function parseStoredFile(
  storageKey: string,
  originalName: string
) {
  const tmp = await fs.mkdtemp(
    path.join(os.tmpdir(), "internal-ai-")
  );

  const target = path.join(
    tmp,
    safeName(originalName)
  );

  try {
    const obj = await downloadObject(
      storageKey
    );

    if (!obj.Body) {
      throw new Error(
        "Stored object has no body"
      );
    }

    await pipeline(
      obj.Body as any,
      (
        await import("node:fs")
      ).createWriteStream(target)
    );

    const ext = path
      .extname(originalName)
      .toLowerCase()
      .slice(1);

    const outputs: {
      path: string;
      content: string;
    }[] = [];

    if (textExt.has(ext)) {
      outputs.push({
        path: originalName,
        content: await fs.readFile(
          target,
          "utf8"
        )
      });
    } else if (ext === "pdf") {
      outputs.push({
        path: originalName,
        content: (
          await pdfParse(
            await fs.readFile(target)
          )
        ).text
      });
    } else if (ext === "docx") {
      outputs.push({
        path: originalName,
        content: (
          await mammoth.extractRawText({
            path: target
          })
        ).value
      });
    } else if (
      ext === "xlsx" ||
      ext === "xls"
    ) {
      const wb = XLSX.read(
        await fs.readFile(target),
        {
          type: "buffer"
        }
      );

      for (const s of wb.SheetNames) {
        outputs.push({
          path: `${originalName}::${s}`,
          content:
            XLSX.utils.sheet_to_csv(
              wb.Sheets[s]
            )
        });
      }
    } else if (ext === "zip") {
      const extract = path.join(
        tmp,
        "extract"
      );

      await fs.mkdir(extract);

      const { execFile } =
        await import(
          "node:child_process"
        );

      await new Promise<void>(
        (resolve, reject) =>
          execFile(
            "unzip",
            [
              "-q",
              target,
              "-d",
              extract
            ],
            {
              timeout: 120000
            },
            (e) =>
              e
                ? reject(e)
                : resolve()
          )
      );

      const files =
        await collectFiles(extract);

      let total = 0;

      for (const f of files) {
        const st =
          await fs.stat(f);

        total += st.size;

        if (
          total >
          MAX_EXTRACTED
        ) {
          throw new Error(
            "Archive expands beyond safety limit"
          );
        }

        if (
          textExt.has(
            path
              .extname(f)
              .slice(1)
              .toLowerCase()
          )
        ) {
          outputs.push({
            path:
              path.relative(
                extract,
                f
              ),
            content:
              await fs.readFile(
                f,
                "utf8"
              )
          });
        }
      }
    } else if (
      ext === "tar" ||
      ext === "gz" ||
      ext === "tgz"
    ) {
      const extract = path.join(
        tmp,
        "extract"
      );

      await fs.mkdir(extract);

      await tar.x({
        file: target,
        cwd: extract,
        filter: (
          p: string
        ) =>
          !path.isAbsolute(p) &&
          !p
            .split("/")
            .includes("..")
      });

      for (const f of await collectFiles(
        extract
      )) {
        if (
          textExt.has(
            path
              .extname(f)
              .slice(1)
              .toLowerCase()
          )
        ) {
          outputs.push({
            path:
              path.relative(
                extract,
                f
              ),
            content:
              await fs.readFile(
                f,
                "utf8"
              )
          });
        }
      }
    }

    return outputs.flatMap((x) =>
      chunks(x.content).map(
        (content, i) => ({
          path: x.path,
          chunkIndex: i,
          content,
          tokenCount:
            Math.ceil(
              content.length / 4
            )
        })
      )
    );
  } finally {
    await fs.rm(tmp, {
      recursive: true,
      force: true
    });
  }
}

export async function sha256Stored(
  storageKey: string
) {
  const obj =
    await downloadObject(
      storageKey
    );

  if (!obj.Body) {
    throw new Error("No body");
  }

  const hash =
    crypto.createHash("sha256");

  for await (const chunk of obj.Body as any) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}
