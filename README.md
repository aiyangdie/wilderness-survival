# 荒野生存 (Wilderness Survival)

2D 荒野生存游戏：采集、狩猎、建造、抵御昼夜怪物。

## 在线游玩

部署后访问：**https://aiyangdie.github.io/wilderness-survival/**

## 本地运行

直接用浏览器打开 `index.html`，或本地静态服务：

```bash
npx serve .
```

## 操作说明

| 按键 | 功能 |
|------|------|
| WASD | 移动 |
| Shift | 冲刺 |
| 左键 | 攻击 |
| E | 交互 / 采集 / 食用快捷栏食物 |
| 1-5 | 切换快捷栏 |
| C | 合成 |
| B | 建造 |
| Tab | 背包 |
| Esc | 取消建造 / 关闭面板 |

## 核心玩法

- **生存指标**：生命、饥饿、口渴、体力随时间下降
- **昼夜循环**：约 2 分钟一天；夜晚生成暗影怪物，狼更活跃
- **资源**：砍树、采石、灌木得纤维
- **狩猎**：攻击或低血量捕获 deer / rabbit
- **合成**：石斧、长矛、烤肉、建筑套件
- **建造**：篝火（回血）、木墙（阻挡）、庇护所（夜晚安全区）

## 项目结构

```
├── index.html          # 入口
├── css/style.css       # UI 样式
└── js/
    ├── main.js         # 启动
    ├── game.js         # 主循环与系统整合
    ├── config.js       # 配置与数据表
    ├── world.js        # 地图与实体生成
    ├── player.js       # 玩家
    ├── entities.js     # AI 与战斗
    ├── building.js     # 建造
    ├── inventory.js    # 背包
    ├── input.js        # 输入
    ├── renderer.js     # 渲染
    └── ui.js           # HUD
```

## 后续扩展计划

- [ ] 存档 / 读档
- [ ] 更多作物、钓鱼、陷阱
- [ ] 装备耐久与护甲
- [ ] 地图迷雾与生物群系
- [ ] 音效与像素贴图

## 许可证

MIT
