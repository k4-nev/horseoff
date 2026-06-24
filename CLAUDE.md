# Horseoff v2

## Deploy commands

After making changes, run from the repo root on a machine with SSH access:

```bash
scp core/server.py root@157.22.207.243:/opt/horseoff-v2/core/
scp core/shell.css root@157.22.207.243:/opt/horseoff-v2/core/
scp core/shell.html root@157.22.207.243:/opt/horseoff-v2/core/
scp modules/channels/channels.js root@157.22.207.243:/opt/horseoff-v2/modules/channels/
scp modules/channels/channels.css root@157.22.207.243:/opt/horseoff-v2/modules/channels/
scp modules/channels/channels.html root@157.22.207.243:/opt/horseoff-v2/modules/channels/
scp modules/bots/bots.js root@157.22.207.243:/opt/horseoff-v2/modules/bots/
scp modules/bots/bots.css root@157.22.207.243:/opt/horseoff-v2/modules/bots/
scp modules/bots/bots.html root@157.22.207.243:/opt/horseoff-v2/modules/bots/
scp modules/bots/bots_api.py root@157.22.207.243:/opt/horseoff-v2/modules/bots/
scp pwa/sw.js root@157.22.207.243:/opt/horseoff-v2/pwa/
```

After uploading `server.py`, restart the server:
```bash
ssh root@157.22.207.243 "systemctl restart horseoff"
```

After uploading `bots_api.py`, restart the server:
```bash
ssh root@157.22.207.243 "systemctl restart horseoff"
```

## Stack

- Vanilla JS + Python WebSocket backend (no frameworks)
- WebRTC mesh P2P (max 6 speakers, unlimited listeners)
- Branch for development: `claude/gallant-fermi-2y4cbp`
