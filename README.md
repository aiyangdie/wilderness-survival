# 荒野生存 (Wilderness Survival)

多版本荒野生存游戏项目：**v1 经典 2D** 稳定版 + **v3 拟真 3D** 开发版。

## 入口（版本选择）

**https://aiyangdie.github.io/wilderness-survival/**

| 版本 | 在线游玩 | 说明 |
|------|----------|------|
| **v1.0 2D 经典版** | [v1-2d/](https://aiyangdie.github.io/wilderness-survival/v1-2d/) | 稳定版，支持下载离线玩 |
| **v3.0 3D 拟真版** | [v3-3d/](https://aiyangdie.github.io/wilderness-survival/v3-3d/) | 第三人称 3D，拟真人体角色 |

## 下载 v1 经典版（GitHub Releases）

- **最新版 ZIP**：https://github.com/aiyangdie/wilderness-survival/releases/latest/download/wilderness-survival-v1-2d.zip
- **所有版本**：https://github.com/aiyangdie/wilderness-survival/releases

下载后解压，打开文件夹内的 `index.html` 即可**无需联网**本地游玩。

## v1 2D 操作

| 按键 | 功能 |
|------|------|
| WASD | 移动 |
| Shift | 冲刺 |
| 左键 | 攻击 |
| E | 交互 / 采集 / 食用 |
| C / B / Tab | 合成 / 建造 / 背包 |

## v3 3D 操作

| 按键 | 功能 |
|------|------|
| WASD | 移动 |
| Shift | 奔跑 |
| 鼠标 | 视角（需锁定） |
| 左键 | 攻击 |
| E | 采集 / 食用 |
| 空格 | 跳跃 |

推荐 Chrome / Edge，允许鼠标指针锁定。

## 项目结构

```
├── index.html          # 版本选择首页
├── css/hub.css
├── v1-2d/              # 2D 经典版（冻结维护）
│   ├── index.html
│   ├── css/
│   └── js/
└── v3-3d/              # 3D 拟真版（活跃开发）
    ├── index.html
    ├── css/
    └── js/
        ├── game.js
        ├── human.js    # 拟真人体与行走动画
        └── world.js
```

## 发版说明

推送标签 `v1.x.x` 会自动打包 `v1-2d/` 并上传到 GitHub Releases 供下载。

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 许可证

MIT
