# SMP Launcher

## Initial setup

Rename template file to package.json:
```bash
mv package.json-template package.json   # For Linux/MacOS
# OR
ren "package.json-template" "package.json"   # For Windows
```

## Install dependencies

```
bun i
```

## Start launcher

```
bun run start
```

## Pack launcher

```
bun run dist

bun run dist:win # only for Windows
bun run dist:linux # only for Linux
bun run dist:mac # only for MacOS
```
