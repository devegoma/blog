// 表示確認用データ。本番の記事管理・タグ機能とは別に扱う。
export const posts = [
    {
        title: "読書メモを、あとから使える形にする",
        date: "2026-10-28",
        tag: "Obsidian",
        description:
            "読んだ内容を、時間が経っても思い出せるように。自分なりの方法と、実際のメモの例を紹介します。",
        minutes: 5,
        image: "reading",
        href: "/posts/sample/",
    },
    {
        title: "小さな自動化を試した記録",
        date: "2026-10-21",
        tag: "TypeScript",
        description:
            "毎日の作業で繰り返ししていた手順を見直す。使ったツールと、試してわかったことを残します。",
        minutes: 4,
        image: "tools",
    },
    {
        title: "コードを書く前に、考えておきたいこと",
        date: "2026-10-14",
        tag: "Astro",
        description:
            "実装の前に整理しておくと、あとで楽になること。小さなプロジェクトで意識したいポイントをまとめました。",
        minutes: 6,
        image: "planning",
    },
];
