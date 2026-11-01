import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createPostSchema } from "../src/data/post-schema.mjs";
import { comparePosts } from "../src/utils/post-order.mjs";

const now = new Date("2026-11-01T03:00:00Z");
const schema = createPostSchema({ astro: "Astro" }, now);
const published = { title: "Article", date: "2026-10-01", draft: false };
function rejects(input, field, validator = schema) {
    const result = validator.safeParse(input);
    assert.equal(result.success, false, JSON.stringify(input));
    assert(
        result.error.issues.some((issue) => issue.path[0] === field),
        result.error.message,
    );
}

test("required fields, types and optional dates", () => {
    for (const draft of [false, true]) {
        for (const title of [undefined, "", " \t ", 123])
            rejects({ ...published, draft, title }, "title");
        for (const [field, value] of Object.entries({
            description: 123,
            date: 123,
            updated: 123,
            tags: "astro",
            draft: "false",
            minutes: "1",
            image: 123,
        }))
            rejects({ ...published, draft, [field]: value }, field);
        rejects({ ...published, draft, tags: [123] }, "tags");
        rejects({ ...published, draft, tags: ["unknown"] }, "tags");
    }
    rejects({ title: "Missing date", draft: false }, "date");
    const draft = schema.parse({ title: "Draft" });
    assert.equal(draft.draft, true);
    assert.equal(draft.date, undefined);
    assert.equal(draft.updated, undefined);
    assert.equal(schema.parse(published).updated, undefined);
});

test("real calendar dates and leap years are checked for both states and fields", () => {
    for (const draft of [false, true]) {
        for (const field of ["date", "updated"]) {
            for (const value of [
                "2026-2-01",
                "2026-01-1",
                "2026/01/01",
                "",
                "2026-01-01T00:00:00Z",
                "2026-00-01",
                "2026-13-01",
                "2026-01-00",
                "2026-01-32",
                "2026-04-31",
                "2026-02-29",
                "1900-02-29",
                "2024-02-30",
            ]) {
                rejects({ ...published, draft, [field]: value }, field);
            }
            for (const value of [
                "2000-02-29",
                "2024-02-29",
                "2026-02-28",
                "2026-04-30",
            ]) {
                assert(
                    schema.safeParse({
                        ...published,
                        date: "1900-01-01",
                        draft,
                        [field]: value,
                    }).success,
                );
            }
        }
    }
});

test("publication and update equality boundaries are inclusive", () => {
    for (const input of [
        { date: "2026-11-01" },
        { date: "2026-11-01", updated: "2026-11-01" },
        { updated: published.date },
        { updated: "2026-11-01" },
    ])
        assert(schema.safeParse({ ...published, ...input }).success);
    rejects({ ...published, date: "2026-11-02" }, "date");
    rejects({ ...published, updated: "2026-09-30" }, "updated");
    rejects({ ...published, updated: "2026-11-02" }, "updated");
});

test("drafts allow future dates and reversed dates until publication", () => {
    for (const input of [
        { date: "2026-11-02" },
        { updated: "2026-11-02" },
        { updated: "2026-09-30" },
        { date: "2027-01-01", updated: "2026-11-02" },
        { date: undefined, updated: "2027-01-01" },
    ]) {
        const draft = { ...published, ...input, draft: true };
        assert(schema.safeParse(draft).success);
        assert.equal(
            schema.safeParse({ ...draft, draft: false }).success,
            false,
        );
    }
});

test("default clock refreshes on every validation across Tokyo midnight", (t) => {
    t.mock.timers.enable({
        apis: ["Date"],
        now: new Date("2026-10-31T14:59:59.999Z"),
    });
    const liveSchema = createPostSchema({});
    const fixedSchema = createPostSchema({}, new Date());
    const input = {
        title: "New day's article",
        date: "2026-11-01",
        updated: "2026-11-01",
        draft: false,
    };
    rejects(input, "date", liveSchema);
    rejects(input, "updated", liveSchema);

    t.mock.timers.setTime(new Date("2026-10-31T15:00:00.000Z").getTime());
    assert.equal(liveSchema.safeParse(input).success, true);
    rejects(input, "date", fixedSchema);
    rejects(input, "updated", fixedSchema);

    const nextDay = { ...input, date: "2026-11-02", updated: "2026-11-02" };
    rejects(nextDay, "date", liveSchema);
    rejects(nextDay, "updated", liveSchema);
    t.mock.timers.setTime(new Date("2026-11-01T15:00:00.000Z").getTime());
    assert.equal(liveSchema.safeParse(nextDay).success, true);
});

test("Tokyo midnight changes the allowed day independently of OS timezone", () => {
    // Each child process imports and runs the actual schema under its own TZ.
    const code = `
        import { createPostSchema } from './src/data/post-schema.mjs';
        const input = { title: 'Boundary', date: '2026-11-01', updated: '2026-11-01', draft: false };
        console.log(JSON.stringify([
            '2026-10-31T14:59:59.999Z',
            '2026-10-31T15:00:00.000Z',
            '2026-11-01T14:59:59.999Z',
            '2026-11-01T15:00:00.000Z',
        ].map(time => {
            const schema = createPostSchema({}, new Date(time));
            return [schema.safeParse(input).success,
                schema.safeParse({...input, date: '2026-11-02', updated: '2026-11-02'}).success];
        })));
    `;
    for (const TZ of [
        "UTC",
        "Asia/Tokyo",
        "America/Los_Angeles",
        "Pacific/Kiritimati",
    ]) {
        const result = spawnSync(
            process.execPath,
            ["--input-type=module", "-e", code],
            {
                cwd: new URL("..", import.meta.url),
                env: { ...process.env, TZ },
                encoding: "utf8",
            },
        );
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(
            JSON.parse(result.stdout),
            [
                [false, false],
                [true, false],
                [true, false],
                [true, true],
            ],
            TZ,
        );
    }
});

test("default order uses publication date then the entire path, never update date", () => {
    const ids = ["z/entry", "a/entry", "a-entry", "a/aaa", "a0", "a/index"];
    const posts = ids.map((id) => ({ id, date: "2026-10-01" }));
    const expected = [
        "newer",
        "a-entry",
        "a/aaa",
        "a/entry",
        "a/index",
        "a0",
        "z/entry",
        "older",
    ];
    const entries = [
        ...posts,
        { id: "older", date: "2026-09-30" },
        { id: "newer", date: "2026-11-01" },
    ];
    assert.deepEqual(
        [...entries].sort(comparePosts).map((p) => p.id),
        expected,
    );
    assert.deepEqual(
        entries
            .map((p, i) => ({
                ...p,
                updated: i % 2 ? "2026-11-01" : undefined,
            }))
            .sort(comparePosts)
            .map((p) => p.id),
        expected,
    );
    assert.equal(comparePosts(posts[0], posts[0]), 0);
});
