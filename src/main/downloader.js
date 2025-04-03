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

    // Проверка существующего файла
    if (fs_sync.existsSync(filePath)) {
        try {
            const existingFileHash = await calculateFileHash(filePath);
            if (existingFileHash === mod.hash) {
                console.log(`Мод ${mod.name} уже загружен и проверен`);
                return true;
            }
            console.log(`Хеш мода ${mod.name} не совпадает, будет загружен заново`);
        } catch (hashError) {
            console.error(`Ошибка при проверке хеша мода ${mod.name}:`, hashError.message);
        }
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Загрузка мода ${mod.name}, попытка ${attempt}`);
            const modResponse = await axios.get(
                `${serverUrl}/get_mod?name=${encodeURIComponent(mod.name)}`,
                {
                    responseType: "arraybuffer",
                    timeout: 60000, // Увеличиваем таймаут до 60 сек
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    headers: { 'Cache-Control': 'no-cache' }
                }
            );

            // Проверка на пустой ответ
            if (!modResponse.data || modResponse.data.length === 0) {
                throw new Error(`Получен пустой ответ для мода ${mod.name}`);
            }

            await fs.writeFile(filePath, modResponse.data);

            const downloadedFileHash = await calculateFileHash(filePath);
            if (downloadedFileHash !== mod.hash) {
                console.error(`Хеш не совпадает для ${mod.name}. Ожидаемый: ${mod.hash}, Полученный: ${downloadedFileHash}`);
                throw new Error(`Хеш не совпадает для ${mod.name}`);
            }

            console.log(`Мод ${mod.name} успешно загружен`);
            return true;
        } catch (downloadError) {
            console.error(
                `Ошибка при загрузке мода ${mod.name} (попытка ${attempt}):`,
                downloadError.message
            );

            if (attempt < maxRetries) {
                const delay = 2000 * attempt;
                console.log(`Повторная попытка через ${delay/1000} секунд...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    console.error(`Все попытки загрузки мода ${mod.name} не удались`);
    return false;
}

async function workerMain() {
    const { mods, threadId, modsDir, serverUrl } = workerData;
    let downloadedCount = 0;

    // Убедимся, что директория существует
    await fs.mkdir(modsDir, { recursive: true });

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
