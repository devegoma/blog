# Domain Docs

## 調査前に読むもの

single-context構成として、次を読む。

- ルートの `CONTEXT.md`
- `docs/adr/` 内の、対象領域に関係するADR

存在しない場合は、そのまま作業を進める。
文書は用語や設計判断が確定した際にdomain-modelingで作成する。

## 用語と設計判断

Issue・提案・テスト名では、`CONTEXT.md` に定義された用語を使う。
必要な概念が未定義なら、既存の用語で表せるか確認し、
不足があればdomain-modelingの対象として記録する。

既存ADRと矛盾する提案は、対象ADRと再検討する理由を明示する。
