import { describe, it, expect, beforeEach } from "vitest";
import {
  PhaseController,
  isNoiseLike,
  cleanForDisplay,
  MAX_CONSECUTIVE_NOISE,
} from "../src/pipeline/PhaseController";
import type { PhaseDelegate, Phase } from "../src/pipeline/PhaseDelegate";

// ── MockDelegate ────────────────────────────────────────────────────

type CallEntry =
  | { method: "emitPhaseChange"; args: [Phase] }
  | { method: "emitSessionActive"; args: [boolean] }
  | { method: "emitResponse"; args: [string] }
  | { method: "emitFinalTranscript"; args: [string] }
  | { method: "emitError"; args: [string] }
  | { method: "armListening" }
  | { method: "commitUtterance" }
  | { method: "disarmListening" }
  | { method: "reason"; args: [string] }
  | { method: "speak"; args: [string] }
  | { method: "abortCurrentWork" }
  | { method: "armBargeInDetection"; args: ["watch" | "watch-speaking"] }
  | { method: "disarmBargeInDetection" }
  | { method: "tearDown"; args: [string] }
  | { method: "startASRPerf" }
  | { method: "endASRPerf" }
  | { method: "startLLMPerf" }
  | { method: "endLLMPerf" }
  | { method: "emitPerformanceMetrics"; args: [number, number] }
  | { method: "waitForEchoCooldown" };

class MockDelegate implements PhaseDelegate {
  calls: CallEntry[] = [];
  reasonResult = "mock response";
  armListeningThrows = false;

  private record(entry: CallEntry) { this.calls.push(entry); }
  methodCalls(name: string): CallEntry[] { return this.calls.filter((c) => c.method === name); }

  emitPhaseChange(phase: Phase) { this.record({ method: "emitPhaseChange", args: [phase] }); }
  emitSessionActive(active: boolean) { this.record({ method: "emitSessionActive", args: [active] }); }
  emitResponse(text: string) { this.record({ method: "emitResponse", args: [text] }); }
  emitFinalTranscript(text: string) { this.record({ method: "emitFinalTranscript", args: [text] }); }
  emitError(msg: string) { this.record({ method: "emitError", args: [msg] }); }

  async armListening() {
    this.record({ method: "armListening" });
    if (this.armListeningThrows) throw new Error("mic unavailable");
  }
  commitUtterance() { this.record({ method: "commitUtterance" }); }
  disarmListening() { this.record({ method: "disarmListening" }); }

  async reason(text: string): Promise<string> {
    this.record({ method: "reason", args: [text] });
    return this.reasonResult;
  }
  async speak(text: string) { this.record({ method: "speak", args: [text] }); }

  abortCurrentWork() { this.record({ method: "abortCurrentWork" }); }
  armBargeInDetection(mode: "watch" | "watch-speaking") { this.record({ method: "armBargeInDetection", args: [mode] }); }
  disarmBargeInDetection() { this.record({ method: "disarmBargeInDetection" }); }

  tearDown(reason: string) { this.record({ method: "tearDown", args: [reason] }); }

  startASRPerf() { this.record({ method: "startASRPerf" }); }
  endASRPerf(): number { this.record({ method: "endASRPerf" }); return 100; }
  startLLMPerf() { this.record({ method: "startLLMPerf" }); }
  endLLMPerf(): number { this.record({ method: "endLLMPerf" }); return 200; }
  emitPerformanceMetrics(asr: number, llm: number) { this.record({ method: "emitPerformanceMetrics", args: [asr, llm] }); }

  async waitForEchoCooldown() { this.record({ method: "waitForEchoCooldown" }); }
}

// ── Helpers ──────────────────────────────────────────────────────────

function phases(d: MockDelegate): Phase[] {
  return d.methodCalls("emitPhaseChange").map((c) => (c as { args: [Phase] }).args[0]);
}

function tearDownReasons(d: MockDelegate): string[] {
  return d.methodCalls("tearDown").map((c) => (c as { args: [string] }).args[0]);
}

// ── Tests ────────────────────────────────────────────────────────────

describe("PhaseController", () => {
  let d: MockDelegate;
  let ctrl: PhaseController;

  beforeEach(() => {
    d = new MockDelegate();
    ctrl = new PhaseController(d);
  });

  // ── #1 Regression: barge-in during thinking → empty ASR → restarts listening
  it("barge-in during thinking + empty transcript → clears flag and restarts listening", async () => {
    await ctrl.start(true);
    ctrl.onUserSpoke();
    // Simulate barge-in during thinking: first we need to be in thinking phase
    // Feed a real transcript to enter thinking, but onBargeIn fires during reason()
    d.reasonResult = "answer";
    // We'll drive this more directly: start → listening, onUserSpoke → transcribing,
    // then feed a real transcript to get into thinking. But barge-in happens during
    // the async reason(). The simplest approach: manually walk through states.

    // Actually, let's test the exact bug scenario:
    // 1. Start session → listening
    // 2. User speaks → transcribing
    // 3. Transcript arrives → enters thinking → reason() starts
    // During reason(), barge-in fires. But since reason() is async and mock resolves
    // instantly, we simulate by: after start, trigger onUserSpoke, then onTranscript
    // with real text to go through thinking→speaking→listening, then trigger a second
    // round where barge-in + empty transcript happens.

    // Simpler: directly test the onTranscript path with bargeInPending.
    // To set bargeInPending, we need onBargeIn during thinking or speaking.
    // Let's use a two-turn approach:

    // Turn 1: normal flow to get back to listening
    ctrl.onUserSpoke();
    await ctrl.onTranscript("你好");
    // Now back in listening (session mode)

    d.calls = []; // reset

    // Turn 2: user speaks → transcribing
    ctrl.onUserSpoke();
    expect(ctrl.getPhase()).toBe("transcribing");

    // Barge-in fires (simulating Vad2 during thinking — but we're in transcribing,
    // which onBargeIn ignores). We need to set bargeInPending differently.

    // The real scenario: transcript arrives → enters thinking → barge-in fires during
    // async reason(). With mock's instant resolution, we can't intercept. Instead,
    // let's make reason() async with a delay and trigger onBargeIn during it.
    let reasonResolve: (v: string) => void;
    const reasonPromise = new Promise<string>((resolve) => { reasonResolve = resolve; });
    d.reason = async (text: string) => {
      d.calls.push({ method: "reason", args: [text] });
      return reasonPromise;
    };

    const transcriptPromise = ctrl.onTranscript("测试");
    // Now ctrl is in "thinking" phase, waiting for reason()
    expect(ctrl.getPhase()).toBe("thinking");

    // Barge-in fires during thinking
    ctrl.onBargeIn();
    expect(d.methodCalls("abortCurrentWork")).toHaveLength(1);

    // Resolve reason (simulating the aborted call returning)
    reasonResolve!("ignored");
    await transcriptPromise;

    // Now the barge-in put us into listening with bargeInPending=true.
    // Vad1 eventually commits ASR → empty transcript comes back
    ctrl.onUserSpoke();
    await ctrl.onTranscript("");

    // Key assertion: session is still alive, back in listening, not stuck
    expect(ctrl.getSessionAlive()).toBe(true);
    expect(ctrl.getPhase()).toBe("listening");
  });

  // ── #2 Barge-in during thinking → real transcript → new thinking cycle
  it("barge-in during thinking + real transcript → enters new reasoning cycle", async () => {
    await ctrl.start(true);
    ctrl.onUserSpoke();

    let reasonResolve: (v: string) => void;
    d.reason = async (text: string) => {
      d.calls.push({ method: "reason", args: [text] });
      return new Promise<string>((resolve) => { reasonResolve = resolve; });
    };

    const p = ctrl.onTranscript("第一句");
    expect(ctrl.getPhase()).toBe("thinking");

    ctrl.onBargeIn();
    reasonResolve!("ignored");
    await p;

    // Now in listening with bargeInPending
    d.calls = [];
    d.reasonResult = "new answer";
    // Re-stub reason to resolve immediately for the second turn
    d.reason = async (text: string) => {
      d.calls.push({ method: "reason", args: [text] });
      return "new answer";
    };

    ctrl.onUserSpoke();
    await ctrl.onTranscript("第二句");

    // Should have gone through thinking with "第二句"
    const reasonCalls = d.methodCalls("reason");
    expect(reasonCalls).toHaveLength(1);
    expect((reasonCalls[0] as { args: [string] }).args[0]).toBe("第二句");
    expect(ctrl.getPhase()).toBe("listening"); // back to listening in session mode
  });

  // ── #3 Barge-in during speaking → empty ASR → restarts listening
  it("barge-in during speaking + empty transcript → restarts listening", async () => {
    await ctrl.start(true);
    ctrl.onUserSpoke();

    // Make speak() async so we can trigger barge-in during it
    let speakResolve: () => void;
    d.speak = async (text: string) => {
      d.calls.push({ method: "speak", args: [text] });
      return new Promise<void>((resolve) => { speakResolve = resolve; });
    };

    const p = ctrl.onTranscript("你好");
    // reason() is instant but async — flush microtasks so speakReply starts
    await new Promise((r) => setTimeout(r, 0));
    expect(ctrl.getPhase()).toBe("speaking");

    ctrl.onBargeIn();
    speakResolve!();
    await p;

    // bargeInPending is true, now empty transcript arrives
    d.calls = [];
    ctrl.onUserSpoke();
    await ctrl.onTranscript("");

    expect(ctrl.getSessionAlive()).toBe(true);
    expect(ctrl.getPhase()).toBe("listening");
  });

  // ── #4 False barge-in → Vad1 idle timeout → prompt user
  it("false barge-in (Vad1 idle timeout) → speaks prompt text", async () => {
    const promptText = "打断了，还需要什么？";
    ctrl = new PhaseController(d, promptText);
    await ctrl.start(true);
    ctrl.onUserSpoke();

    let speakResolve: () => void;
    d.speak = async (text: string) => {
      d.calls.push({ method: "speak", args: [text] });
      return new Promise<void>((resolve) => { speakResolve = resolve; });
    };

    const p = ctrl.onTranscript("你好");
    // reason() is instant but async — flush microtasks so speakReply starts
    await new Promise((r) => setTimeout(r, 0));
    expect(ctrl.getPhase()).toBe("speaking");

    // Barge-in during speaking
    ctrl.onBargeIn();
    speakResolve!();
    await p;

    // bargeInPending=true, now Vad1 times out (no follow-up speech)
    d.calls = [];
    // Re-stub speak to resolve immediately for the prompt
    d.speak = async (text: string) => {
      d.calls.push({ method: "speak", args: [text] });
    };

    await ctrl.onVad1IdleTimeout();

    const speakCalls = d.methodCalls("speak");
    expect(speakCalls).toHaveLength(1);
    expect((speakCalls[0] as { args: [string] }).args[0]).toBe(promptText);

    const responseCalls = d.methodCalls("emitResponse");
    expect(responseCalls).toHaveLength(1);
    expect((responseCalls[0] as { args: [string] }).args[0]).toBe(promptText);
  });

  // ── #5 Normal turn flow: listening → transcript → thinking → speaking → listening
  it("normal session turn cycles through all phases", async () => {
    await ctrl.start(true);
    expect(ctrl.getPhase()).toBe("listening");

    ctrl.onUserSpoke();
    expect(ctrl.getPhase()).toBe("transcribing");

    d.reasonResult = "回答";
    await ctrl.onTranscript("问题");

    // After full turn, back to listening (session mode)
    expect(ctrl.getPhase()).toBe("listening");
    expect(ctrl.getSessionAlive()).toBe(true);

    const phaseSeq = phases(d);
    expect(phaseSeq).toEqual([
      "listening",     // start
      "transcribing",  // onUserSpoke
      "thinking",      // onTranscript → runReasoning
      "speaking",      // speakReply
      "listening",     // onTurnComplete → back to listening
    ]);

    // Verify the full delegation sequence
    expect(d.methodCalls("emitFinalTranscript")).toHaveLength(1);
    expect(d.methodCalls("reason")).toHaveLength(1);
    expect(d.methodCalls("speak")).toHaveLength(1);
    expect(d.methodCalls("emitResponse")).toHaveLength(1);
    expect(d.methodCalls("waitForEchoCooldown")).toHaveLength(1);
  });

  // ── #6 Empty transcript (session mode) → restart listening
  it("empty transcript in session mode → restarts listening", async () => {
    await ctrl.start(true);
    ctrl.onUserSpoke();

    const armBefore = d.methodCalls("armListening").length;
    await ctrl.onTranscript("");

    expect(ctrl.getPhase()).toBe("listening");
    expect(ctrl.getSessionAlive()).toBe(true);
    expect(d.methodCalls("armListening").length).toBe(armBefore + 1);
  });

  // ── #7 Empty transcript (push-to-talk) → end session
  it("empty transcript in push-to-talk → ends session", async () => {
    await ctrl.start(false);
    ctrl.onUserSpoke();
    await ctrl.onTranscript("");

    expect(ctrl.getPhase()).toBe("idle");
    expect(ctrl.getSessionAlive()).toBe(false);
    expect(tearDownReasons(d)).toContain("idle-timeout");
  });

  // ── #8 Consecutive noise ×3 → session ends
  it("consecutive noise streak reaches MAX → ends session with noise-timeout", async () => {
    await ctrl.start(true);

    for (let i = 0; i < MAX_CONSECUTIVE_NOISE; i++) {
      ctrl.onUserSpoke();
      await ctrl.onTranscript("嗯");
    }

    expect(ctrl.getSessionAlive()).toBe(false);
    expect(ctrl.getPhase()).toBe("idle");
    expect(tearDownReasons(d)).toContain("noise-timeout");
  });

  // ── #9 Exit keyword → immediate end
  it("exit keyword in session mode → ends session immediately", async () => {
    await ctrl.start(true);
    ctrl.onUserSpoke();
    await ctrl.onTranscript("我要退出");

    expect(ctrl.getSessionAlive()).toBe(false);
    expect(ctrl.getPhase()).toBe("idle");
    expect(tearDownReasons(d)).toContain("exit-keyword");
    // reason() should NOT have been called
    expect(d.methodCalls("reason")).toHaveLength(0);
  });

  // ── #10 Phase guards: onBargeIn is noop outside thinking/speaking
  it("onBargeIn is ignored when not in thinking or speaking", async () => {
    await ctrl.start(true);
    expect(ctrl.getPhase()).toBe("listening");

    const callsBefore = d.calls.length;
    ctrl.onBargeIn();

    // No abortCurrentWork, no state change
    expect(d.methodCalls("abortCurrentWork")).toHaveLength(0);
    expect(ctrl.getPhase()).toBe("listening");
    expect(d.calls.length).toBe(callsBefore);
  });

  // ── #11 Cancel during listening — simplest baseline
  it("cancel during listening → ends session immediately", async () => {
    await ctrl.start(true);
    expect(ctrl.getPhase()).toBe("listening");

    ctrl.cancel();

    expect(ctrl.getSessionAlive()).toBe(false);
    expect(ctrl.getPhase()).toBe("idle");
    expect(tearDownReasons(d)).toContain("user-cancel");
  });

  // ── #12 Cancel during thinking — reason() is in flight
  //
  // User cancels while the LLM is still computing. Even if reason() later
  // resolves (simulating the orchestrator returning after its abort signal
  // lands), no downstream delegate work (speak / emitResponse / onTurnComplete
  // side-effects) should happen. The sessionAlive guard in runReasoning is
  // what enforces this.
  it("cancel during thinking → aborts cleanly, late reason() resolution drops everything", async () => {
    await ctrl.start(true);
    ctrl.onUserSpoke();

    // Make reason() hang so we can cancel mid-flight
    let reasonResolve: (v: string) => void;
    d.reason = async (text: string) => {
      d.calls.push({ method: "reason", args: [text] });
      return new Promise<string>((resolve) => { reasonResolve = resolve; });
    };

    const transcriptPromise = ctrl.onTranscript("问题");
    expect(ctrl.getPhase()).toBe("thinking");

    ctrl.cancel();

    // Session is dead immediately, before reason() resolves
    expect(ctrl.getSessionAlive()).toBe(false);
    expect(ctrl.getPhase()).toBe("idle");
    expect(tearDownReasons(d)).toContain("user-cancel");

    // Now let the stale reason() call finish (mimics orchestrator.abort
    // throwing → VoicePipeline catches → returns "" → we reach this point)
    reasonResolve!("stale response that should be ignored");
    await transcriptPromise;

    // Nothing downstream should have fired
    expect(d.methodCalls("speak")).toHaveLength(0);
    expect(d.methodCalls("emitResponse")).toHaveLength(0);
    expect(d.methodCalls("emitPerformanceMetrics")).toHaveLength(0);
    expect(d.methodCalls("waitForEchoCooldown")).toHaveLength(0);
    expect(ctrl.getPhase()).toBe("idle");
  });

  // ── #13 Cancel during speaking — speak() is in flight
  //
  // User cancels while TTS is still playing. The speak() promise eventually
  // resolves (e.g. AudioPlayer.stop() unblocks it); speakReply's sessionAlive
  // check prevents emitPerformanceMetrics and onTurnComplete from running.
  it("cancel during speaking → aborts cleanly, late speak() resolution drops turn completion", async () => {
    await ctrl.start(true);
    ctrl.onUserSpoke();

    // Hang speak() — reason() resolves instantly with a real response
    let speakResolve: () => void;
    d.speak = async (text: string) => {
      d.calls.push({ method: "speak", args: [text] });
      return new Promise<void>((resolve) => { speakResolve = resolve; });
    };

    const transcriptPromise = ctrl.onTranscript("问题");
    // Flush microtasks so runReasoning completes and speakReply enters "speaking"
    await new Promise((r) => setTimeout(r, 0));
    expect(ctrl.getPhase()).toBe("speaking");

    ctrl.cancel();

    expect(ctrl.getSessionAlive()).toBe(false);
    expect(ctrl.getPhase()).toBe("idle");
    expect(tearDownReasons(d)).toContain("user-cancel");

    speakResolve!();
    await transcriptPromise;

    // Turn completion should not have fired — no echo cooldown wait,
    // no perf metrics emitted, no restart of listening.
    expect(d.methodCalls("waitForEchoCooldown")).toHaveLength(0);
    expect(d.methodCalls("emitPerformanceMetrics")).toHaveLength(0);
    // armListening was called once at session start (for the first listening
    // phase); no second call triggered by onTurnComplete after cancel.
    expect(d.methodCalls("armListening")).toHaveLength(1);
    expect(ctrl.getPhase()).toBe("idle");
  });
});

// ── cleanForDisplay ─────────────────────────────────────────────────

describe("cleanForDisplay", () => {
  it("strips <tool_call> XML blocks", () => {
    expect(cleanForDisplay("Hello <tool_call>fn()</tool_call> world")).toBe("Hello  world");
  });

  it("strips <function=...> blocks", () => {
    expect(cleanForDisplay("text <function=foo>{}</function> more")).toBe("text  more");
  });

  it("strips <|tool_call_begin|> blocks", () => {
    expect(cleanForDisplay("a <|tool_call_begin|>x<|tool_call_end|> b")).toBe("a  b");
  });

  it("returns empty string for tool-call-only content", () => {
    expect(cleanForDisplay("<tool_call>fn()</tool_call>")).toBe("");
  });

  it("passes through normal text unchanged", () => {
    expect(cleanForDisplay("正常回答")).toBe("正常回答");
  });
});
