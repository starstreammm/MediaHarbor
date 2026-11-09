<div align="center">
  <img src="./public/Icon-square.svg" alt="structure" width="288" />
  <br />
  <br />
  <img alt="Node Current" src="https://img.shields.io/node/v/%40rolldown%2Fplugin-babel">
  <img alt="Python Version" src="https://img.shields.io/badge/python-3.14%2B-blue">
  <img alt="GitHub License" src="https://img.shields.io/github/license/starstreammm/MediaHarbor">
  <img alt="GitHub Release" src="https://img.shields.io/github/v/release/starstreammm/MediaHarbor">
  <img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/starstreammm/MediaHarbor/publish.yml?label=Action">
  <br />
  <img alt="GitHub forks" src="https://img.shields.io/github/forks/starstreammm/MediaHarbor">
	<img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/starstreammm/MediaHarbor">
	<img alt="GitHub Issues or Pull Requests" src="https://img.shields.io/github/issues/starstreammm/MediaHarbor">
 </div>

## 1 Introduction

The media on social platforms is unreliable, as it can be blocked, hidden, or removed. For our favorite content, getting a 404 is an extremely annoying thing.

MediaHarbor is here to help you solve this issue. It downloads the media, as well as the description, avatar, and other information, and saves them locally. Unless your disk borked, no one can prevent you from accessing this pleasing content.

## 2 Features

- Friendly WebUI interface and convenient installation with Docker.
- Provide various levels of control precision, including post, account, creator, and collection.
- Auto-sync accounts' content, automatically downloading new posts and recording profile changes.
- Built with FastAPI, React & Vite, and MUI, providing modern and fast experiences.

## 3 Support Platform

| Platform      | Supportable   |
| ------------- | ------------- |
| Douyin        | ✅             |
| Bilibili      | Developing... |
| Xiao Hong Shu | Developing... |
| X             | Developing... |
| Instagram     | Developing... |
| YouTube       | Developing... |

## 4 Installation

### 4.1 Docker Compose (Recommended)

MediaHarbor can be deployed using [Docker Compose](./docker-compose.yaml). The provided configuration includes MediaHarbor, PostgreSQL, and Aria2 Pro, with optional Mihomo proxy support.

#### Configure Basic Settings

Open `compose.yaml` and locate the `x-config` section at the top:

##### Timezone

Replace `Asia/Shanghai` with your preferred timezone, such as `UTC` or `America/New_York`.

##### Security Token

Replace `your-token` with a secure random token.

You can generate one using OpenSSL:

```bash
openssl rand -hex 32
```

The token is shared across MediaHarbor, Aria2 RPC, and PostgreSQL. You only need to configure it once.

> **Important:** Keep your token private. Do not use the default placeholder in production or commit your configured secrets to a public repository.

#### Configure Storage

MediaHarbor uses Docker volumes to persist downloaded files, cache, and database data.

| Name     | Default                | Purpose                   |
| -------- | ---------------------- | ------------------------- |
| data     | Host (config required) | Media files and downloads |
| cache    | Docker-managed volume  | Application cache         |
| postgres | Docker-managed volume  | PostgreSQL database       |
| certs    | Disabled               | Custom SSL certificates   |
| mihomo   | Disabled               | Mihomo configuration      |

#### (Optional) Enable SSL Connection

To provide your own SSL certificates, uncomment the `certs` volume definition and configure its host directory.

```yaml
    certs:
        driver: local
        driver_opts:
            type: none
            o: bind
            device: /path/to/certs
```

Then uncomment the corresponding mount under the `mediaharbor` service:

```yaml
- certs:/etc/nginx/certs:ro
```

Inside the folder, the structure must be:

```
/path/to/certs/
	├── cert.crt
	├── cert.key
```

The program will automatically detect if the certificate and key exist and decide whether to use SSL connection.

#### (Optional) Mihomo Proxy

Mihomo is an optional proxy service.

To enable it:

1. Uncomment the `mihomo` volume definition and configure its storage location if needed.

2. Uncomment the entire `mihomo` service under `services`.

3. Place your Mihomo configuration in the mounted configuration directory.

4. Configure MediaHarbor or other services to use the proxy as needed.

> Enabling the Mihomo container does not automatically route MediaHarbor's traffic through the proxy.

### 4.2 Local Installation

1. Install `nginx` and `ffmpeg`.
2. Download the [latest release](https://github.com/starstreammm/MediaHarbor/releases/latest/download/release.tar.gz).
3. Copy the files under `/dist` to the specificd location in nginx.
4. To install the necessary pip packages, run the command `uv sync --locked`.
   Install the guest browser with `uv run python -m cloakbrowser install`; see [DTK setup](docs/douyin-tiktok.md) for system dependencies and pool configuration.
5. Start the backend api using `uvicorn main:app --host 0.0.0.0 --port 38888` under `/src`
6. Run `./nginx_entrypoint.sh` to start nginx.

### 4.3 Develop Mode

```bash
git clone --recurse-submodules https://github.com/starstreammm/MediaHarbor.git
cd MediaHarbor
npm i
uv sync --locked
uv run python -m cloakbrowser install
npm run dev
uv run uvicorn main:app --app-dir src --reload --port 38888
```

## Links

Douyin Api: [https://github.com/Evil0ctal/Douyin_TikTok_Download_API](https://github.com/Evil0ctal/Douyin_TikTok_Download_API)

FFmpeg: [https://ffmpeg.org](https://ffmpeg.org/)

MUI: https://mui.com/material-ui/
