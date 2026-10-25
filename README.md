# Research-LLM

卒業研究「AIコーディングエージェントと人間の相互作用が、1つの依頼の中でどう展開し、利用期間を通じてどう変化するか」のための開発リポジトリです。

研究室メンバーが普段の開発（VS Code／Unity）で使うAIコーディングエージェントの利用イベントを、本人の同意のもとで自動収集する基盤を作ります。
現在は要件定義の前の段階で、アプリケーションコードはまだありません。

- 研究目的・RQ：[00_context/research-questions.md](00_context/research-questions.md)
- 開発の前提と制約：[00_context/research-context.md](00_context/research-context.md)
- 作業ルール：[AGENTS.md](AGENTS.md)
- Devin での進め方（要件定義 → 設計 → 実装）：[devin/README.md](devin/README.md)

## フォルダ構成

```
00_context/   研究の前提資料（研究目的・RQ・研究コンテキスト）
01_docs/      要件定義書・設計書・メモ
02_scripts/   プログラム一式
devin/        Devin 用 Playbook
.devin/       Devin の設定（環境定義・Skills）
.github/      PR テンプレート
```

以前の研究室用LLMチャットボット（v1）は削除済みです。タグ `v1-chatbot` から参照できます。
