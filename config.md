---
title: Minecraft 插件配置
description: 配置 Minecraft 服务器连接、消息同步与 RCON 命令白名单
fields:
  - key: base.say_way
    label: 聊天前缀
    type: text
    description: QQ 消息转发到 MC 时显示的前缀，默认 "说："
    placeholder: 说：

  - key: base.display_server_name
    label: 显示服务器名称
    type: switch
    description: 消息中是否显示服务器名称

  - key: base.reverse_ws_enabled
    label: 启用反向 WebSocket
    type: switch
    description: 启用反向连接（MC 服务器连接到此机器人）

  - key: base.reverse_ws_port
    label: 反向连接端口
    type: number
    description: 反向 WebSocket 监听端口
    placeholder: 8080

  - key: base.reverse_ws_path
    label: 反向连接路径
    type: text
    description: 反向 WebSocket 路径
    placeholder: /minecraft/ws

  - key: base.reverse_ws_password
    label: 反向连接密码
    type: secret
    description: 反向 WebSocket 连接密码

  - key: base.servers
    label: 服务器列表
    type: array
    description: 配置多个 Minecraft 服务器连接
    itemFields:
      - key: server_name
        label: 服务器名称
        type: text
        description: 服务器唯一标识，不能与其他服务器重复
        placeholder: main

      - key: ws_url
        label: WebSocket 地址
        type: text
        description: 服务器 WebSocket 连接地址（正向连接时使用）
        placeholder: ws://127.0.0.1:8081

      - key: ws_password
        label: 连接密码
        type: text
        description: WebSocket 连接密码（可选）

      - key: group_list
        label: 关联群聊
        type: text
        description: 关联的 QQ 群号

      - key: bot_self_id
        label: 机器人账号
        type: text
        description: 机器人 QQ 号

      - key: command_header
        label: 命令前缀
        type: text
        description: RCON 命令前缀，默认 "$"
        placeholder: $

      - key: command_user
        label: 命令白名单
        type: textarea
        description: 允许执行 RCON 命令的 QQ 号列表，每行一个

      - key: rcon_command_whitelist
        label: RCON 命令白名单
        type: textarea
        description: 允许执行的 RCON 命令列表，每行一个

      - key: sync_enabled
        label: 启用同步
        type: switch
        description: 是否启用消息同步

      - key: ws_max_attempts
        label: 最大重连次数
        type: number
        description: WebSocket 最大重连次数
        placeholder: 10

      - key: forward_ws_enabled
        label: 启用正向 WebSocket
        type: switch
        description: 启用正向连接（连接到 MC 服务器）

      - key: reverse_ws_enabled
        label: 启用反向连接
        type: switch
        description: 该服务器是否启用反向连接

      - key: rcon_enabled
        label: 启用 RCON
        type: switch
        description: 启用 RCON 命令执行

      - key: rcon_host
        label: RCON 地址
        type: text
        description: RCON 服务器地址
        placeholder: 127.0.0.1

      - key: rcon_port
        label: RCON 端口
        type: number
        description: RCON 端口
        placeholder: 25575

      - key: rcon_password
        label: RCON 密码
        type: secret
        description: RCON 密码

  - key: play.servers
    label: 游玩服务器列表
    type: array
    description: bot 可加入游玩的 Minecraft 服务器（原版/leaves）
    itemFields:
      - key: id
        label: 服务器 ID
        type: text
        description: 唯一标识，AI 工具按此选择服务器
        placeholder: survival
      - key: name
        label: 显示名称
        type: text
        description: 服务器显示名
        placeholder: 生存服
      - key: host
        label: 地址
        type: text
        description: 服务器地址。可写 host[:port]（如 play.example.com:25565），省略端口时会自动尝试 _minecraft._tcp.<host> 的 SRV 解析，失败则默认 25565
        placeholder: play.example.com
      - key: version
        label: 版本
        type: text
        description: Minecraft 版本，留空自动协商
        placeholder: "1.20.4"
      - key: username
        label: 假人名称
        type: text
        description: bot 加入服务器使用的名字
        placeholder: MikuBot
      - key: auth
        label: 认证方式
        type: text
        description: offline 或 microsoft，默认 offline
        placeholder: offline
      - key: password
        label: 认证密码
        type: secret
        description: microsoft 认证时使用
      - key: maxPlayMs
        label: 最长游玩时长(ms)
        type: number
        description: 单次游玩最长时长，到点自动下线
        placeholder: 1800000

      - key: joinCommands
        label: 加入后自动执行的命令
        type: textarea
        description: bot 第一次进入该服务器后自动发送的命令（每行一条，如 /login xxx），仅在首次 spawn 时执行，重生不重复

      - key: allowedCommands
        label: AI 命令白名单
        type: textarea
        description: Working AI 可发送的斜杠命令前缀，每行一条；未列出的命令会被拒绝

  - key: play.groups
    label: 群聊绑定
    type: array
    description: 配置哪些群允许触发 bot 游玩及可选服务器
    itemFields:
      - key: groupId
        label: 群号
        type: text
        description: QQ 群号
        placeholder: "518680610"
      - key: botSelfId
        label: 机器人账号
        type: text
        description: 该群使用的 bot QQ 号
      - key: allowedServerIds
        label: 允许的服务器
        type: textarea
        description: 允许该群触发的服务器 ID，每行一个

  - key: play.toolPermission
    label: 工具权限
    type: text
    description: 谁可触发 bot 进出服（owner/admin/member，需重启生效）
    placeholder: admin
  - key: play.mainLoopMinIntervalMs
    label: 主模型最小间隔(ms)
    type: number
    description: 主模型两次调用最小间隔
    placeholder: 15000
  - key: play.mainLoopIdleIntervalMs
    label: 空闲唤醒间隔(ms，已废弃)
    type: number
    description: 为兼容旧配置保留；事件驱动版本不再定时调用主模型
    placeholder: 60000
  - key: play.mainConversationFocusMs
    label: 游戏连续对话窗口(ms)
    type: number
    description: 玩家明确呼叫 bot 后，后续消息可继续触发主 AI 的时间窗口
    placeholder: 120000
  - key: play.workEventDebounceMs
    label: 工作事件合并窗口(ms)
    type: number
    description: 合并短时间内连续受伤、状态变化和任务结果，避免重复调用 Working AI
    placeholder: 1000
  - key: play.workLoopMinIntervalMs
    label: Working AI 最小间隔(ms)
    type: number
    description: 普通事件触发的 Working AI 最小调用间隔；新指令和致命事件可绕过
    placeholder: 5000
  - key: play.behaviorTickIntervalMs
    label: 行为引擎 tick(ms)
    type: number
    description: 行为引擎 tick 间隔
    placeholder: 200
  - key: play.gameChatHistoryLines
    label: 游戏聊天窗口（已废弃）
    type: number
    description: 为兼容旧配置保留；事件驱动版本改用增量事件游标
    placeholder: 40
  - key: play.qqHistoryLines
    label: QQ 聊天窗口（已废弃）
    type: number
    description: 为兼容旧配置保留；QQ 消息按事件游标进入下一次主模型上下文
    placeholder: 20
  - key: play.maxPlayBudgetWarnRatio
    label: 预算提醒比例
    type: number
    description: 到该比例时提醒主模型收尾
    placeholder: 0.85
  - key: play.goodbyeTimeoutMs
    label: 告别超时(ms)
    type: number
    description: 生成告别语的超时时间
    placeholder: 8000
  - key: play.qqSendPerMinute
    label: QQ 每分钟上限
    type: number
    description: bot 向 QQ 群发送消息的每分钟上限
    placeholder: 3
  - key: play.gameChatMinIntervalMs
    label: 游戏发言间隔(ms)
    type: number
    description: bot 游戏内连续发言最小间隔
    placeholder: 1500
  - key: play.debug.enabled
    label: 调试模式
    type: switch
    description: 开启后主人可用 /join /say /motion 等命令手动测试行为（不启动 AI 循环），详见 play/debug/README.md
---

```mioku-fields
keys:
  - base.say_way
  - base.display_server_name
  - base.reverse_ws_enabled
  - base.reverse_ws_port
  - base.reverse_ws_path
  - base.reverse_ws_password
  - base.servers
  - play.servers
  - play.groups
  - play.toolPermission
  - play.mainLoopMinIntervalMs
  - play.mainLoopIdleIntervalMs
  - play.mainConversationFocusMs
  - play.workEventDebounceMs
  - play.workLoopMinIntervalMs
  - play.behaviorTickIntervalMs
  - play.gameChatHistoryLines
  - play.qqHistoryLines
  - play.maxPlayBudgetWarnRatio
  - play.goodbyeTimeoutMs
  - play.qqSendPerMinute
  - play.gameChatMinIntervalMs
  - play.debug.enabled
```
