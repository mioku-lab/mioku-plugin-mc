# mc play 调试命令

> 仅当 `config/mc/play.json` 的 `debug.enabled = true` 且发送者为 bot 主人（owner）时生效。
> 这些命令不注册到帮助系统，仅供调试/测试行为引擎使用，不会触发 AI 循环。

## 开关

在 `config/mc/play.json` 中：

```json
{ "debug": { "enabled": true } }
```

开启后，bot 主人在**已配置游玩绑定的群**里发送以下命令即可。`/join` 进入后**不会启动主模型循环**，bot 只连接服务器并保持 idle 行为；主人用命令手动操控。

## 命令清单

| 命令 | 作用 | 示例 |
|------|------|------|
| `/join <服务器ID>` | 以 debug 模式进入服务器（无 AI 循环） | `/join survival` |
| `/exit` | 离开当前服务器 | `/exit` |
| `/say <文本>` | 让 bot 在游戏内发言 | `/say 大家好~` |
| `/motion <移动行为> [key=value ...]` | 设置移动行为 | `/motion follow target=Steve distance=3` |
| `/motion <defend\|auto_eat> [key=...]` | 切换叠加状态（开/关） | `/motion defend radius=10` |
| `/stop` | 停止移动，回 idle（叠加状态保留） | `/stop` |
| `/clear` | 清空所有状态（移动 + 叠加） | `/clear` |
| `/off <名称>` | 关闭指定叠加状态 | `/off defend` |
| `/status` | 查看启用的状态 & 正在执行的行为 | `/status` |
| `/behaviors` | 列出所有行为及参数 | `/behaviors` |

行为系统的并发模型、每个状态的含义、参数说明详见 [`play/behavior/README.md`](../behavior/README.md)。

## 移动行为（`/motion`，同时只能有一个）

- `idle`
- `follow target=<玩家名> [distance=<格>]`
- `gather resource=<wood|stone|coal|iron>`
- `farm_mobs`
- `guard [x=<int> y=<int> z=<int>] [radius=<格>]`（不传坐标则守当前位置）
- `socialize`
- `flee`
- `explore`

## 叠加状态（`/motion`，可同时开多个，按优先级抢占移动）

- `defend [radius=<格, 默认8>]` - 自动战斗，敌对生物靠近时抢占移动去攻击
- `auto_eat` - 自动进食，饥饿且有食物且不在战斗时进食

生存层（escape_lava / mlg_fall / flee_creeper / escape_water）常驻，无需开启。

### 示例：同时跟随 + 自动战斗 + 自动进食

```
/join survival
/motion auto_eat                          # 开自动进食
/motion defend                            # 开自动战斗
/motion follow target=Steve distance=3    # 跟随 Steve
/status                                   # 看三个状态都启用了
/stop                                     # 停跟随（叠加保留）
/clear                                    # 全清
/exit
```

## 说明

- `/join` 走的是 debug 入口：bot 连接服务器、启动行为引擎与生存层（岩浆/MLG/苦力怕/溺水/饥饿仍会自动抢占保护），但**不启动主模型循环和工作模型**。所以 bot 不会自己说话或决策，全靠主人的命令。
- `/say` 和 `/motion` 需要已有一个进行中的会话（先 `/join`）。bot 尚未连接完成时会回复"bot 尚未连接到服务器"。
- 生存层在 debug 模式下仍然生效——例如测试 `follow` 时若苦力怕靠近，会自动撤离。
- 正常的 AI 入口（chat 主模型调用 `mc.control_bot` 工具）与 debug 互不影响；AI 入口会启动完整循环。
- 关闭 debug 后这些命令不再被拦截，会当作普通群消息处理。
