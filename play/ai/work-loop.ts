import type { PlaySession } from "../session";
import type { PlayPluginContext } from "../context";
import { buildWorkPrompt } from "./prompt";
import { parseWorkOutput } from "./output-parser";
import { withTimeoutMs } from "../util/async";

const WORK_MODEL_TIMEOUT_MS = 15_000;

export class WorkLoop {
  private readonly session: PlaySession;
  private readonly pluginCtx: PlayPluginContext;

  constructor(opts: {
    session: PlaySession;
    pluginCtx: PlayPluginContext;
  }) {
    this.session = opts.session;
    this.pluginCtx = opts.pluginCtx;
  }

  start(): void {
    // nothing; driven by MainLoop.onAction
  }

  stop(): void {
    // nothing
  }

  async dispatch(action: string): Promise<void> {
    const work = this.pluginCtx.workInstance;
    const bot = this.session.controller.bot;
    if (!work || !bot) return;

    const snap = this.session.getBehaviorSnapshot();
    if (!snap) return;

    const prompt = buildWorkPrompt({
      action,
      snapshot: snap,
      lastBundle: this.session.getCurrentMission()?.bundleId ?? null,
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

    const parsed = parseWorkOutput(output);
    const result = this.session.startMission({
      bundle: parsed.bundle,
      params: parsed.params,
    });
    this.session.recordSwitchResult(result);
    if (result.kind === "applied") {
      this.pluginCtx.ctx.logger.info(
        `[MC/play] 任务启动: ${result.bundleId} (mission=${result.missionId.slice(0, 8)})`,
      );
    } else {
      this.pluginCtx.ctx.logger.warn(
        `[MC/play] 任务启动失败: ${result.reason} - ${result.detail}`,
      );
    }
  }
}
