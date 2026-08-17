-- D1 数据库建表语句
-- 执行：wrangler d1 execute word-db --remote --file=./schema.sql
-- 本地测试：wrangler d1 execute word-db --local --file=./schema.sql

CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL UNIQUE,
  phonetic TEXT,
  meanings TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);
