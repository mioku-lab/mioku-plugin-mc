import type { PlaySession } from "../session";
import type { PlayPluginContext } from "../context";
import type { BehaviorEngine } from "../behavior/engine";
import { buildWorkPrompt } from "./prompt";
import { parseWorkOutput } from "./output-parser";
import { buildBotStatus } from "../util/status";
import { withTimeoutMs } from "../util/async";

const WORK_MODEL_TIMEOUT_MS = 15_000;

export class WorkLoop {
  private readonly session: PlaySession;
  private readonly pluginCtx: PlayPluginContext;
  private readonly engine: BehaviorEngine;

  constructor(opts: {
    session: PlaySession;
    pluginCtx: PlayPluginContext;
    engine: BehaviorEngine;
  }) {
    this.session = opts.session;
    this.pluginCtx = opts.pluginCtx;
    this.engine = opts.engine;
  }

  start(): void {
    // nothing; driven by MainLoop.onAction
  }

  stop(): void {
    // nothing
  }

  async dispatch(action: string): Promise<void> {
    const work = this.pluginCtx.workInstance;
    const config = this.pluginCtx.getPlayConfig();
    const bot = this.session.controller.bot;
    if (!work || !bot) return;

    const status = buildBotStatus(
      bot,
      this.engine.currentLabel(),
      Date.now() - this.session.startedAt,
      this.session.server.maxPlayMs,
    );
    if (!status) return;

    const prompt = buildWorkPrompt({
      action,
      status,
      lastBehavior: this.engine.currentLabel(),
    });

    let output = "";
    try {
      output = await withTimeoutMs(
        work.generateText({
          prompt,
          messages: [],
          temperature: 0.2,
        }),
        WORK_MODEL_TIMEOUT_MS,
      );
    } catch (err) {
      this.pluginCtx.ctx.logger.warn(`[MC/play] 工作模型调用失败: ${err}`);
      return;
    }

    const spec = parseWorkOutput(output);
    this.engine.setUserBehavior(spec);
    this.pluginCtx.ctx.logger.info(
      `[MC/play] 行为切换: ${spec.behavior} ${JSON.stringify(spec.params)}`,
    );
  }
}
