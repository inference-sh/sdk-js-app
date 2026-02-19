# @inferencesh/app — build inference.sh apps in node.js

[![npm version](https://img.shields.io/npm/v/@inferencesh/app.svg)](https://www.npmjs.com/package/@inferencesh/app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

app framework for building [inference.sh](https://inference.sh) apps in node.js — file handling, output metadata, and storage utilities.

this is the **app-side** sdk. for the **client-side** sdk (calling apps, agents, file uploads), see [@inferencesh/sdk](https://www.npmjs.com/package/@inferencesh/sdk).

## installation

```bash
npm install @inferencesh/app
```

## what's included

| export | description |
|--------|-------------|
| `File` | smart file reference — downloads urls, caches locally, resolves paths, serializes for the engine |
| `StorageDir` | standard storage directory constants (`DATA`, `TEMP`, `CACHE`) |
| `download()` | download a url to a directory with caching |
| `textMeta`, `imageMeta`, `videoMeta`, `audioMeta`, `rawMeta` | output metadata factories for usage-based pricing |

## file handling

the `File` class handles downloading, caching, and path resolution — the node.js equivalent of the python sdk's `File` class.

### reading input files

```javascript
import { File } from "@inferencesh/app";

async run(inputData) {
  // Input files come as URLs — File downloads and caches them
  const file = await File.from(inputData.image);
  console.log(file.path);        // /home/.cache/inferencesh/files/abc123/image.jpg
  console.log(file.contentType);  // image/jpeg
  console.log(file.size);        // 102400
}
```

### returning output files

```javascript
import { File } from "@inferencesh/app";

async run(inputData) {
  const outputPath = "/tmp/result.png";
  await generateImage(inputData.prompt, outputPath);

  // File.fromPath is sync — no download needed for local files
  return { image: File.fromPath(outputPath) };
}
```

the engine reads `path` from the serialized output and uploads it to cdn automatically.

### how File serializes

`File` implements `toJSON()` so it works seamlessly with `JSON.stringify`:

```javascript
const file = File.fromPath("/tmp/output.png");
JSON.stringify(file);
// {"path":"/tmp/output.png","content_type":"image/png","size":102400,"filename":"output.png"}
```

### construction options

```javascript
// From URL (downloads and caches)
const file = await File.from("https://example.com/image.jpg");

// From local path
const file = await File.from("/tmp/output.png");

// From options object
const file = await File.from({ path: "/tmp/output.png", contentType: "image/png" });

// From engine-style data (snake_case)
const file = await File.from({ uri: "https://...", content_type: "image/jpeg" });

// Sync from local path (no download)
const file = File.fromPath("/tmp/output.png");
```

### caching

downloaded files are cached at `~/.cache/inferencesh/files/{url_hash}/{filename}`. set `FILE_CACHE_DIR` to override.

## storage directories

```javascript
import { StorageDir, ensureDir } from "@inferencesh/app";

// Standard directories available on inference.sh workers
StorageDir.DATA   // "/app/data"  — persistent storage
StorageDir.TEMP   // "/app/tmp"   — cleaned between runs
StorageDir.CACHE  // "/app/cache" — persists, may be evicted

// Ensure directory exists
const dataDir = ensureDir(StorageDir.DATA);
```

## download utility

```javascript
import { download, StorageDir } from "@inferencesh/app";

// Download to a specific directory with caching
const modelPath = await download(
  "https://huggingface.co/org/model/resolve/main/weights.bin",
  StorageDir.CACHE
);
// Returns: /app/cache/{hash}/weights.bin
```

skips download if the file already exists in the target directory (except for `TEMP`).

## output metadata

report what your app processes and generates for usage-based pricing:

```javascript
import { textMeta, imageMeta, videoMeta, audioMeta } from "@inferencesh/app";

// LLM app
async run(inputData) {
  const result = await this.llm.generate(inputData.prompt);
  return {
    response: result.text,
    output_meta: {
      inputs: [textMeta({ tokens: result.promptTokens })],
      outputs: [textMeta({ tokens: result.completionTokens })],
    },
  };
}

// Image generation app
async run(inputData) {
  const image = await this.model.generate(inputData.prompt);
  return {
    image: File.fromPath(image.path),
    output_meta: {
      outputs: [imageMeta({ width: 1024, height: 1024, steps: 20 })],
    },
  };
}

// Video generation app
async run(inputData) {
  return {
    video: File.fromPath(videoPath),
    output_meta: {
      outputs: [videoMeta({ resolution: "1080p", seconds: 5.0, fps: 30 })],
    },
  };
}
```

### meta types

| factory | key fields |
|---------|-----------|
| `textMeta` | `tokens` |
| `imageMeta` | `width`, `height`, `resolution_mp`, `steps`, `count` |
| `videoMeta` | `width`, `height`, `resolution`, `seconds`, `fps` |
| `audioMeta` | `seconds`, `sample_rate` |
| `rawMeta` | `cost` (dollar cents) |

all meta types support an optional `extra` field for app-specific pricing factors.

## full app example

```javascript
import { z } from "zod";
import { File, textMeta } from "@inferencesh/app";

export const RunInput = z.object({
  prompt: z.string().describe("Input prompt"),
  image: z.string().optional().describe("Optional image URL"),
});

export const RunOutput = z.object({
  result: z.string(),
  processedImage: z.any().optional(),
});

export class App {
  async setup(config) {
    this.model = await loadModel();
  }

  async run(inputData) {
    // Handle input files
    let imageFile;
    if (inputData.image) {
      imageFile = await File.from(inputData.image);
    }

    const result = await this.model.process({
      prompt: inputData.prompt,
      imagePath: imageFile?.path,
    });

    return {
      result: result.text,
      processedImage: result.outputPath
        ? File.fromPath(result.outputPath)
        : undefined,
      output_meta: {
        inputs: [textMeta({ tokens: result.inputTokens })],
        outputs: [textMeta({ tokens: result.outputTokens })],
      },
    };
  }
}
```

## requirements

- node.js 18.0.0 or higher
- zero runtime dependencies

## resources

- [documentation](https://inference.sh/docs) — getting started guides
- [app development guide](https://inference.sh/docs/extend/app-code) — writing app logic
- [client sdk](https://www.npmjs.com/package/@inferencesh/sdk) — calling apps from your code
- [discord](https://discord.gg/RM77SWSbyT) — community support

## license

MIT © [inference.sh](https://inference.sh)
