import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getLauncherVersion() {
    try {
        const packageJson = JSON.parse(
            readFileSync(join(__dirname, '../../package.json'), 'utf8')
        );
        return packageJson.version || '1.1.2';
    } catch (error) {
        console.error('Error reading version:', error);
        return '1.1.2'; // Fallback version
    }
}

export default getLauncherVersion;
