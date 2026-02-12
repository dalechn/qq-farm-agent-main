---
name: server-upload
description: Upload files to your remote server via scp/rsync. Defaults to 161.97.75.41 (user: root) and destination /opt/1panel/apps/openresty/openresty/www/sites/frenmap.fun. Supports SSH key auth (recommended) or password auth via sshpass using SERVER_PASS.
---

# Server Upload Skill

Upload files or directories from your local machine to your server using scp/rsync. This skill is preconfigured for:

- Host: 161.97.75.41
- User: root
- Destination: /opt/1panel/apps/openresty/openresty/www/sites/frenmap.fun

A helper script is included at `bin/upload.sh` to simplify uploads.

## Prerequisites

You can use either of the following authentication methods:

### Option A (Recommended): SSH Key-based Authentication
1) Generate a key (if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   # Press Enter to accept default path ~/.ssh/id_ed25519
   ```
2) Install your key on the server (one-time):
   - If you already can SSH with password, run:
   ```bash
   ssh root@161.97.75.41 'mkdir -p ~/.ssh && chmod 700 ~/.ssh'
   cat ~/.ssh/id_ed25519.pub | ssh root@161.97.75.41 "cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
   ```
   - After this, you should be able to login without a password:
   ```bash
   ssh root@161.97.75.41
   ```

### Option B: Password-based Authentication via sshpass
1) Install sshpass:
   ```bash
   brew install hudochenkov/sshpass/sshpass
   ```
2) Export your password in the current shell before using the helper script:
   ```bash
   export SERVER_PASS='YOUR_PASSWORD'
   ```
   Note: Avoid storing plaintext passwords in files. Prefer exporting in a session or using a secrets manager.

## Quick Tests
- Verify connectivity and target path:
  ```bash
  ssh root@161.97.75.41 'ls -la /opt/1panel/apps/openresty/openresty/www/sites/frenmap.fun || echo MISSING'
  ```

## Helper Script: bin/upload.sh
This script will:
- Create the remote destination directory if missing
- Use rsync when available (fast, incremental); fallback to scp
- Support both SSH keys and password (via sshpass + SERVER_PASS)
- Exclude common development artifacts by default when using rsync

Default exclude list (rsync only):
- node_modules
- .git
- dist
- build
- coverage
- .next
- .turbo
- .cache
- .DS_Store

Usage:
```bash
# Upload a file
./bin/upload.sh /path/to/local/file.ext

# Upload an entire directory (will copy the directory contents)
./bin/upload.sh /path/to/local/dir

# Upload into a subfolder under the destination
./bin/upload.sh /path/to/local/file.ext assets
```

Environment overrides (optional):
- `SERVER_HOST` (default: 161.97.75.41)
- `SERVER_USER` (default: root)
- `SERVER_PORT` (default: 22)
- `SERVER_DEST` (default: /opt/1panel/apps/openresty/openresty/www/sites/frenmap.fun)
- `SERVER_PASS` (if set, script will use sshpass for password auth)
- `EXCLUDE_DEFAULTS` colon-separated patterns to exclude (default: `node_modules:.git:dist:build:coverage:.next:.turbo:.cache:.DS_Store`)
- `EXCLUDE_EXTRA` colon-separated extra patterns
- `EXCLUDE_FILE` path to an rsync --exclude-from file
- `DISABLE_EXCLUDES=1` to disable all excludes

## Examples
```bash
# Key-based auth
./bin/upload.sh dist/

# Password-based auth (in current shell only)
export SERVER_PASS='******'
./bin/upload.sh build/app.zip releases
```

## Manual Commands (Without Helper Script)
- Upload a file (scp):
  ```bash
  scp -P 22 -o StrictHostKeyChecking=no -r ./file.ext \
      root@161.97.75.41:/opt/1panel/apps/openresty/openresty/www/sites/frenmap.fun/
  ```
- Upload a directory (rsync):
  ```bash
  rsync -avz --progress -e "ssh -p 22 -o StrictHostKeyChecking=no" ./dist/ \
      root@161.97.75.41:/opt/1panel/apps/openresty/openresty/www/sites/frenmap.fun/
  ```
- Password with sshpass:
  ```bash
  export SERVER_PASS='******'
  sshpass -p "$SERVER_PASS" scp -P 22 -o StrictHostKeyChecking=no -r ./file.ext \
      root@161.97.75.41:/opt/1panel/apps/openresty/openresty/www/sites/frenmap.fun/
  ```

## Ownership and Permissions (optional)
If your OpenResty site runs under a specific user/group, adjust ownership:
```bash
ssh root@161.97.75.41 'chown -R www-data:www-data /opt/1panel/apps/openresty/openresty/www/sites/frenmap.fun'
```
Replace `www-data:www-data` with the actual user:group used by your stack.

## Security Notes
- Prefer SSH keys over passwords, and avoid using the `root` account for routine uploads. Consider creating a limited user and granting it permissions to the site directory.
- Never commit plaintext passwords to repositories. If you must use passwords, export them per-session only or via a secure secrets manager.
