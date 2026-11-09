import { describe, expect, it } from "vitest";
import { dayKey, nextDayStart } from "../src/util.js";

const LA = "America/Los_Angeles";

describe("nextDayStart（利用回数のリセット時刻）", () => {
  it("太平洋標準時の 0 時＝日本時間 17 時を返す", () => {
    // 2026-11-02 16:28 JST に使った場合、リセットは同日 17:00 JST
    expect(nextDayStart(new Date("2026-11-02T07:28:00Z"), LA).toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });

  it("太平洋夏時間の 0 時＝日本時間 16 時を返す", () => {
    expect(nextDayStart(new Date("2026-07-01T12:00:00Z"), LA).toISOString()).toBe("2026-07-02T07:00:00.000Z");
  });

  it("夏時間が終わる日（2026-11-01）をまたいでも正しい", () => {
    expect(nextDayStart(new Date("2026-11-01T06:00:00Z"), LA).toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(nextDayStart(new Date("2026-11-01T07:00:00Z"), LA).toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });

  it("夏時間が始まる日（2026-03-08）をまたいでも正しい", () => {
    expect(nextDayStart(new Date("2026-03-08T12:00:00Z"), LA).toISOString()).toBe("2026-03-09T07:00:00.000Z");
  });

  it("日本時間の区切りにも使える", () => {
    expect(nextDayStart(new Date("2026-11-09T03:00:00Z"), "Asia/Tokyo").toISOString()).toBe("2026-11-09T15:00:00.000Z");
  });

  it("リセット時刻の直前と当日で日付キーが切り替わる", () => {
    const now = new Date("2026-11-02T07:28:00Z");
    const reset = nextDayStart(now, LA);
    expect(dayKey(new Date(reset.getTime() - 1), LA)).toBe(dayKey(now, LA));
    expect(dayKey(reset, LA)).not.toBe(dayKey(now, LA));
  });
});
