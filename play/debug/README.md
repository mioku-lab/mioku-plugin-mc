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
| `/motion <行为> [key=value ...]` | 直接切换到指定行为 | `/motion follow target=Steve distance=3` |
| `/stop` | 停止当前行为，回到 idle | `/stop` |
| `/status` | 查看当前会话状态（服务器/连接/行为/时长） | `/status` |
| `/behaviors` | 列出可用行为及参数 | `/behaviors` |

## 可用行为（`/motion` 的 `<行为>`）

- `idle`
- `follow target=<玩家名> [distance=<格>]`
- `defend [radius=<格>]`
- `follow_assist target=<玩家名>`
- `gather resource=<wood|stone|food|coal|iron>`
- `farm_mobs`
- `guard [x=<int> y=<int> z=<int>] [radius=<格>]`（不传坐标则守当前位置）
- `socialize`
- `flee`
- `explore`

### 示例

```
/join survival
/say 我来啦~
/motion follow target=Steve distance=3
/motion defend radius=10
/motion gather resource=wood
/stop
/status
/exit
```

## 说明

- `/join` 走的是 debug 入口：bot 连接服务器、启动行为引擎与生存层（岩浆/MLG/苦力怕/溺水/饥饿仍会自动抢占保护），但**不启动主模型循环和工作模型**。所以 bot 不会自己说话或决策，全靠主人的命令。
- `/say` 和 `/motion` 需要已有一个进行中的会话（先 `/join`）。bot 尚未连接完成时会回复"bot 尚未连接到服务器"。
- 生存层在 debug 模式下仍然生效——例如测试 `follow` 时若苦力怕靠近，会自动撤离。
- 正常的 AI 入口（chat 主模型调用 `mc.control_bot` 工具）与 debug 互不影响；AI 入口会启动完整循环。
- 关闭 debug 后这些命令不再被拦截，会当作普通群消息处理。
