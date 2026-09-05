<div align="center">
  <img src="./public/Icon-square.svg" alt="structure" width="288" />
  <br />
  <br />
  <img alt="Node Current" src="https://img.shields.io/node/v/%40rolldown%2Fplugin-babel">
  <img alt="Python Version" src="https://img.shields.io/badge/python-3.12%2B-blue">
  <img alt="GitHub License" src="https://img.shields.io/github/license/starstreammm/MediaHarbor">
  <img alt="GitHub Release" src="https://img.shields.io/github/v/release/starstreammm/MediaHarbor">
  <img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/starstreammm/MediaHarbor/release.yml?label=Release">
	<img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/starstreammm/MediaHarbor/docker.yml?label=Docker">
  <br />
  <img alt="GitHub forks" src="https://img.shields.io/github/forks/starstreammm/MediaHarbor">
	<img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/starstreammm/MediaHarbor">
	<img alt="GitHub Issues or Pull Requests" src="https://img.shields.io/github/issues/starstreammm/MediaHarbor">
 </div>

## 0 Introduction

The media on social platforms is unreliable, as it can be blocked, hidden, or removed. For our favorite content, getting a 404 is an extremely annoying thing.

Mediaharbor is here to help you solve this issue. It downloads the media, as well as the description, avatar, and other information, and saves them locally. Unless your disk borked, no one can prevent you from accessing this pleasing content.

## 1 Features

- Friendly WebUI interface and convenient installation with Docker.
- Provide various levels of control precision, including post, account, creator, and collection.
- Auto-sync accounts' content, automatically downloading new posts and recording profile changes.
- Built with FastAPI, React & Vite, and MUI, providing modern and fast experiences.

## 2 Support Platform

| Platform      | Supportable   |
| ------------- | ------------- |
| Douyin        | ✅             |
| Bilibili      | Developing... |
| Xiao Hong Shu | Developing... |
| X             | Developing... |
| Instagram     | Developing... |
| YouTube       | Developing... |

## 3 Installation

### 0 Docker Compose (Recommended)

Use the [docer-compose.yml]((./docker-compose.yml)) in the repo.

Change the mount path to your own config. The paths that need to be changed are shown below:

| Path                      | Description                                                  |
| ------------------------- | ------------------------------------------------------------ |
| /path/to/data             | The data downloaded by Mediaharbor, including videos and photos from avatar to posts. |
| /path/to/cache            | The path of log files, temparory hls files and config files. |
| /path/to/postgres         | The database storage.                                        |
| /path/to/certs (Optional) | The folder that contains your ssl certification and key.     |

### 1 Local Installation

1. Install `nginx` and `ffmpeg`.
2. Download the [latest release](https://github.com/starstreammm/MediaHarbor/releases/latest/download/release.tar.gz).
3. Copy the files under `/dist` to the specificd location in nginx.
4. To install the necessary pip packages, run the command `pip install -r requirements.txt`.
5. Start the backend api using `uvicorn main:app --host 0.0.0.0 --port 38888` under `/api`
6. Run `./nginx_entrypoint.sh` to start nginx.

### 2 Develop Mode

```bash
git clone --recurse-submodules https://github.com/starstreammm/MediaHarbor.git
cd MediaHarbor
npm i
pip install -r requirements.txt
npm run dev
fastapi dev api/main.py --port 38888
```

### 3 (Optional) Enable SSL Connection

The path `/path/to/certs` must be mounted. Inside the folder, the structure must be:

```
/path/to/certs/
	├── cert.crt
	├── cert.key
```

The entrypoint will automatically detect if the certificate and key exist and decide whether to use SSL connection.

## Links

Douyin Api: [https://github.com/Evil0ctal/Douyin_TikTok_Download_API](https://github.com/Evil0ctal/Douyin_TikTok_Download_API)

FFmpeg: [https://ffmpeg.org](https://ffmpeg.org/)

MUI: https://mui.com/material-ui/

