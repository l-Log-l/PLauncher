import { parentPort, workerData } from "worker_threads";
import axios from "axios";
import path from "path";
import { promises as fs } from "fs";
import fs_sync from "fs";
import crypto from "crypto";

async function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs_sync.createReadStream(filePath);

        stream.on("data", (data) => hash.update(data));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", (error) => reject(error));
    });
}

async function downloadMod(mod, modsDir, serverUrl) {
    const maxRetries = 3;
    const fileName = `${mod.name}.jar`;
    const filePath = path.join(modsDir, fileName);

    if (fs_sync.existsSync(filePath)) {
        const existingFileHash = await calculateFileHash(filePath);
        if (existingFileHash === mod.hash) {
            return true;
        }
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const modResponse = await axios.get(
                `${serverUrl}/get_mod?name=${encodeURIComponent(mod.name)}`,
                {
                    responseType: "arraybuffer",
                    timeout: 30000,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                }
            );

            await fs.writeFile(filePath, modResponse.data);

            const downloadedFileHash = await calculateFileHash(filePath);
            if (downloadedFileHash !== mod.hash) {
                throw new Error(`Хэш не совпадает для ${mod.name}`);
            }

            return true;
        } catch (downloadError) {
            console.error(
                `Ошибка при загрузке мода ${mod.name} (попытка ${attempt}):`,
                downloadError.message
            );

            if (attempt < maxRetries) {
                await new Promise((resolve) =>
                    setTimeout(resolve, 2000 * attempt)
                );
            }
        }
    }

    return false;
}

async function workerMain() {
    const { mods, threadId, modsDir, serverUrl } = workerData;
    let downloadedCount = 0;

    for (const mod of mods) {
        const result = await downloadMod(mod, modsDir, serverUrl);

        if (result) {
            downloadedCount++;
            parentPort.postMessage({
                threadId,
                mod: mod.name,
                status: "Мод загружен",
                downloaded: downloadedCount,
                total: mods.length,
            });
        } else {
            parentPort.postMessage({
                threadId,
                mod: mod.name,
                status: "Ошибка загрузки",
                downloaded: downloadedCount,
                total: mods.length,
            });
        }
    }
}

workerMain().catch(console.error);
