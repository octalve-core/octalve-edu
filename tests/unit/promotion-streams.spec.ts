import "../support/env";
import { test, expect } from "@playwright/test";
import { nextRungClasses, resolveNextClassGroup, streamPlacement, type ClassGroupMinimal } from "@/lib/promotion/rules";

// The stream rules of a promotion (task 0035), as tables. A rung with one class, with several and no stream, with a stream among them, and every way the stream can fail to pick one.

const cls = (id: string, sortOrder: number, extra: Partial<ClassGroupMinimal> = {}): ClassGroupMinimal => ({
  id,
  name: id,
  sortOrder,
  campusId: null,
  streamName: null,
  archivedAt: null,
  ...extra,
});

test.describe("nextRungClasses", () => {
  test("the live classes of the next rung, the campus's own first, then by name", () => {
    const all = [
      cls("jss3", 3, { campusId: "n" }),
      cls("z-ss1", 4, { campusId: "n" }),
      cls("a-ss1", 4, { campusId: null }),
      cls("b-ss1", 4, { campusId: "n" }),
      cls("ss2", 5, { campusId: "n" }),
    ];
    expect(nextRungClasses(all[0], all).map((c) => c.id)).toEqual(["b-ss1", "z-ss1", "a-ss1"]);
  });

  test("an archived class is not on the rung, another campus's class is not on this campus's ladder, the last rung has none", () => {
    const all = [
      cls("jss3", 3, { campusId: "n" }),
      cls("old", 4, { campusId: "n", archivedAt: new Date() }),
      cls("south", 4, { campusId: "s" }),
      cls("ss2", 5, { campusId: "n" }),
    ];
    expect(nextRungClasses(all[0], all).map((c) => c.id)).toEqual(["ss2"]); // old is archived and south is another campus's, so the next rung is 5
    expect(nextRungClasses(all[3], all)).toEqual([]);
  });
});

test.describe("streamPlacement", () => {
  const jss3 = cls("jss3", 3);

  test("no class on the rung: nothing to place into", () => {
    expect(streamPlacement(jss3, [])).toEqual({ target: null, needsPlacement: false });
  });

  test("one class: that one, nothing to ask", () => {
    const rung = [cls("ss1", 4)];
    expect(streamPlacement(jss3, rung)).toEqual({ target: rung[0], needsPlacement: false });
  });

  test("several classes and no stream among them: the first, the same way every time (what the roll did before streams)", () => {
    const rung = [cls("ss1-a", 4), cls("ss1-b", 4)];
    expect(streamPlacement(jss3, rung)).toEqual({ target: rung[0], needsPlacement: false });
  });

  test("a class that is a stream goes to the class of its own stream, whatever the order", () => {
    const rung = [cls("ss2-arts", 5, { streamName: "Arts" }), cls("ss2-sci", 5, { streamName: "Science" })];
    const science = cls("ss1-sci", 4, { streamName: "Science" });
    expect(streamPlacement(science, rung)).toEqual({ target: rung[1], needsPlacement: false });
    expect(streamPlacement(cls("ss1-arts", 4, { streamName: "Arts" }), rung)).toEqual({ target: rung[0], needsPlacement: false });
  });

  test("the match ignores case and spacing at the ends", () => {
    const rung = [cls("x", 5, { streamName: "science " }), cls("y", 5, { streamName: "Arts" })];
    expect(streamPlacement(cls("c", 4, { streamName: "  SCIENCE" }), rung).needsPlacement).toBe(false);
    expect(streamPlacement(cls("c", 4, { streamName: "  SCIENCE" }), rung).target?.id).toBe("x");
  });

  test("a class with no stream cannot say: the first is only the suggestion and the roll must ask", () => {
    const rung = [cls("ss1-arts", 4, { streamName: "Arts" }), cls("ss1-sci", 4, { streamName: "Science" })];
    expect(streamPlacement(jss3, rung)).toEqual({ target: rung[0], needsPlacement: true });
  });

  test("a stream that no class of the rung carries cannot say either", () => {
    const rung = [cls("a", 4, { streamName: "Arts" }), cls("b", 4, { streamName: "Science" })];
    expect(streamPlacement(cls("c", 3, { streamName: "Commercial" }), rung).needsPlacement).toBe(true);
  });

  test("two classes of the rung with the pupils' stream do not pick one: the roll asks", () => {
    const rung = [
      cls("sci-1", 4, { streamName: "Science" }),
      cls("sci-2", 4, { streamName: "Science" }),
      cls("arts", 4, { streamName: "Arts" }),
    ];
    expect(streamPlacement(cls("c", 3, { streamName: "Science" }), rung)).toEqual({ target: rung[0], needsPlacement: true });
  });

  test("a campus's own class of the stream beats a school-wide class of the same stream", () => {
    const own = cls("own-sci", 4, { campusId: "n", streamName: "Science" });
    const whole = cls("whole-sci", 4, { campusId: null, streamName: "Science" });
    const arts = cls("arts", 4, { campusId: "n", streamName: "Arts" });
    const current = cls("c", 3, { campusId: "n", streamName: "Science" });
    expect(streamPlacement(current, nextRungClasses(current, [current, whole, own, arts]))).toEqual({ target: own, needsPlacement: false });
  });

  test("a school-wide class of the stream is used when the campus has none of its own", () => {
    const whole = cls("whole-sci", 4, { campusId: null, streamName: "Science" });
    const arts = cls("arts", 4, { campusId: "n", streamName: "Arts" });
    const current = cls("c", 3, { campusId: "n", streamName: "Science" });
    expect(streamPlacement(current, nextRungClasses(current, [current, whole, arts])).target).toEqual(whole);
  });
});

test.describe("resolveNextClassGroup keeps its answer", () => {
  test("it is the stream-aware target, and the last rung still graduates", () => {
    const all = [
      cls("sci", 3, { streamName: "Science" }),
      cls("sci-next", 4, { streamName: "Science" }),
      cls("arts-next", 4, { streamName: "Arts" }),
    ];
    expect(resolveNextClassGroup(all[0], all)).toEqual({ nextClass: all[1], isTerminalClass: false });
    expect(resolveNextClassGroup(all[1], all)).toEqual({ nextClass: null, isTerminalClass: true });
  });
});
