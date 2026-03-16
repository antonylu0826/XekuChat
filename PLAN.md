# XekuChat — 企業內部聊天系統開發計劃

## 專案目標

開發一套企業內部人員使用的聊天系統，功能對標 LINE，支援 OSS、OAuth 登入、多平台、
圖片/超連結訊息、群組功能，且容易佈署與維護。目標規模：**20,000 使用者**。

---

## 技術架構

| 層級 | 技術 | 理由 |
|------|------|------|
| Runtime | Bun | 高效能、原生 WebSocket |
| Backend | Hono + Prisma | 輕量、型別安全 |
| Real-time | WebSocket + Redis Pub/Sub | 20,000 人規模需跨節點廣播 |
| Frontend | React 19 + shadcn/ui + Tailwind CSS | 現代化元件 |
| Database | PostgreSQL + pgroonga | 主資料庫，pgroonga 支援中文全文搜尋 |
| Cache / Pub/Sub | Redis | WebSocket 跨節點、session cache、presence 彙總 |
| Auth | OAuth 2.0 / OIDC + JWT | 企業 SSO |
| File Storage | MinIO (S3-compatible) | 圖片/影片/檔案，可橫向擴展 |
| File Upload | tus 協議（斷點續傳） | 100MB 大檔在行動網路下的可靠性 |
| Container | Docker + docker-compose | 一鍵部署（未來可遷移至 Swarm / K8s） |
| Reverse Proxy | Caddy | 自動 HTTPS、WebSocket proxy、sticky session |
| AI 整合 | OpenAI-compatible API | 統一介面，支援任意 LLM（Ollama/GPT/Claude 等）|

---

## 決策紀錄

| 項目 | 決策 |
|------|------|
| 使用人數規模 | 20,000 人（需 Redis Pub/Sub + 水平擴展） |
| 訊息保留 | 由管理員設定保留天數，到期自動清除 |
| 訊息撤回 | 支援（類 LINE，撤回後顯示「此訊息已收回」） |
| 稽核日誌 | 需要，管理員可查閱（法規合規），從 Phase 1 起即記錄 |
| 訊息格式 | 純文字 + Markdown |
| 全文搜尋 | PostgreSQL + pgroonga（支援中日韓斷詞） |
| 已讀回條 | 已讀 + 已讀人數（類 LINE），使用水位線模式避免資料膨脹 |
| 檔案上傳 | 單檔上限 100MB，支援圖片/影片/PDF/Office，tus 斷點續傳 |
| 表情 | Emoji 反應（無貼圖） |
| AI 助理建立權限 | 僅管理員可建立，可指派給頻道或使用者 |
| AI 使用場景 | DM 直聊 + 頻道 @mention 兩種模式 |
| AI LLM 後端 | 統一 OpenAI-compatible API 格式，管理員填入 base_url / api_key / model |
| Integration API | 後續必做（Phase 7）— REST API 供外部系統（n8n、AI）發送訊息，類 LINE Messaging API |
| AI Tool Use | 後續必做（Phase 7） |
| 語音/視訊通話 | 後續必做（Phase 7） |
| 備份與監控 | 後續必做（Phase 7） |
| 外網存取 | 公網直接開放（方案 B），未來可遷移至 Cloudflare Tunnel |
| i18n | 首批 en / zh-TW，後續擴充 vi（越南文） |
| 管理後台 | 獨立 Admin 頁面（獨立路由，非嵌入聊天 UI） |
| Mobile | PWA 優先；Capacitor 原生 App 列為備選 |

---

## 系統功能模組

### Phase 1 — 基礎架構 + 組織骨架 ✅
- [x] 專案骨架（monorepo: server / client / core）
- [x] PostgreSQL schema + Prisma ORM + pgroonga 擴充
- [x] Redis 連線（ioredis）
- [x] 組織（Organization）基礎建立：建立組織、加入成員、角色指派
- [x] OAuth 2.0 / OIDC 登入，支援以下 Provider：
  - **Keycloak**（企業首選，自架，支援 LDAP/AD 串接、MFA、群組同步）
  - Google Workspace
  - GitHub
  - 任何標準 OIDC Provider（Azure AD、Okta 等）
- [x] JWT access token（記憶體）+ HttpOnly refresh cookie
- [x] 稽核日誌基礎設施（AuditLog 寫入，從第一天起記錄所有管理操作）
- [x] Docker + docker-compose 一鍵部署
- [x] i18n 基礎設施（i18next，首批 en / zh-TW，後續擴充 vi 越南文）
- [x] Caddy 反向代理 + 自動 HTTPS
- [x] Phase 1 e2e 測試（Auth 4 cases + 組織頻道 6 cases）

### Phase 2 — 即時通訊核心 ✅
- [x] WebSocket 連線管理（online / offline / away 狀態）
- [x] WebSocket sticky session（Caddy 用 IP hash 或 cookie affinity）
- [x] WebSocket 斷線重連 + 訊息回填（用 lastReceivedMsgId 做 gap fill）
- [x] WebSocket 訊息發送速率限制（防 flood，每人每秒限 N 則）
- [x] Redis Pub/Sub 跨節點廣播（支援水平擴展）
- [x] 私人訊息（1 對 1 DM）
- [x] 群組 / 頻道（Channel）
- [x] 訊息已讀水位線 + 已讀人數計算（ChannelReadCursor 模式）
- [x] 訊息類型：文字、圖片、檔案、超連結
- [x] 訊息分頁 / 無限捲動（cursor-based pagination）
- [x] 打字中提示（typing indicator）
- [x] 訊息撤回（收回後顯示「此訊息已收回」，寫入 AuditLog）
- [x] Phase 2 e2e 測試（WebSocket 訊息 6 cases + 斷線重連 1 case）

### Phase 3 — 訊息豐富功能 ✅
- [x] 圖片上傳（拖拉、貼上 Ctrl+V）
- [x] 大檔上傳：tus 斷點續傳（影片 / PDF / Office，單檔上限 100MB）
- [x] URL 自動預覽（Open Graph）
- [x] Emoji 反應
- [x] 訊息引用 / 回覆（Thread）
- [x] Markdown 渲染（粗體、程式碼、清單、連結）
- [x] pgroonga 全文搜尋（支援中文斷詞）
- [x] Phase 3 e2e 測試（上傳、搜尋、反應、回覆、URL 預覽）

### Phase 4 — 進階組織與權限管理 + Admin 後台
- [ ] **獨立 Admin 頁面**（`/admin` 路由，僅 org admin 可存取）
  - 使用者管理（清單、停用、角色變更）
  - 頻道管理（建立、刪除、成員調整）
  - 組織設定（訊息保留天數、全域通知）
  - AI 助理管理（建立 / 編輯 / 停用 / 指派）
  - 稽核日誌檢視（篩選、匯出）
  - Integration API Key 管理（Phase 7 預留 UI）
- [ ] 頻道進階管理：公開 / 私有 / 唯讀頻道
- [ ] 成員邀請流程、角色進階權限（Admin / Member / Guest）
- [ ] 通知設定（靜音、@mention）
- [ ] 使用者個人資料與頭像
- [ ] Web Push 訂閱管理（Service Worker + VAPID）
- [ ] Presence 大規模廣播優化（只通知同頻道成員 + 批次彙總每 5 秒）

### Phase 5 — 多平台
- [ ] Web App（PWA，可安裝至桌面/手機）
- [ ] Desktop App（Tauri — 輕量約 5MB，Windows/macOS/Linux）
- [ ] Mobile：**PWA 優先**（Safari 加入主畫面，iOS 16.4+ 支援 Web Push）

> **備選：Capacitor 原生 App**
> 若需上架 App Store / MDM 企業派送，可改用 Capacitor 封裝。
> 注意：需另接 APNs（iOS，$99/年）與 FCM（Android）。

### Phase 6 — AI 聊天助理
- [ ] AIAssistant 管理後台（管理員建立 / 編輯 / 停用）
- [ ] LLM 連線設定（base_url、api_key、model、system_prompt）
- [ ] API Key 加密儲存（AES-256-GCM，key 從環境變數載入）
- [ ] 指派助理至頻道（@mention 觸發）或開放給指定使用者 DM
- [ ] DM 模式：使用者與 AI 助理 1 對 1 聊天
- [ ] 頻道 @mention 模式：在群組中 @AI助理 觸發回覆
- [ ] Streaming 回應（token by token 透過 WebSocket 串流）
- [ ] 對話脈絡管理（sliding window，可設最大 context 訊息數）
- [ ] AI 回應訊息視覺標示（顯示 AI 來源與模型名稱）

### Phase 7 — 維運強化 + Integration API（後續必做）

**Integration API（類 LINE Messaging API）：**
- [ ] Integration 管理後台（管理員建立 / 停用 / 重新產生 API Key）
- [ ] API Key 認證（per-integration，獨立於 OAuth，Bearer token）
- [ ] REST API 端點：
  - `POST /api/v1/messages/push` — 發送訊息給指定使用者
  - `POST /api/v1/messages/multicast` — 發送訊息給多位使用者
  - `POST /api/v1/messages/broadcast` — 發送訊息至指定頻道
  - `GET /api/v1/channels` — 取得頻道列表
  - `GET /api/v1/users` — 取得使用者列表
  - `GET /api/v1/channels/:id/messages` — 取得頻道訊息
- [ ] 支援訊息類型：文字、圖片（URL）、檔案（URL）、Markdown
- [ ] Webhook 回呼：訊息事件通知外部系統（新訊息、@mention 等）
- [ ] API 速率限制（per-integration）
- [ ] API 呼叫稽核日誌

**維運：**
- [ ] AI Tool Use / Function Calling（搜尋內部文件、RAG 知識庫）
- [ ] 語音 / 視訊通話（WebRTC + mediasoup 自架 SFU）
- [ ] PostgreSQL 自動備份（pg_dump + 排程）
- [ ] 監控：Prometheus + Grafana
- [ ] Health check endpoint
- [ ] 訊息保留政策自動清除（管理員設定天數，cron job 執行）

---

## 測試策略

### 工具：Playwright（API + WebSocket + UI 測試統一框架）

測試分三層，隨 Phase 進度持續追加：

| 層級 | 測試範圍 | 何時加入 |
|------|---------|---------|
| API 測試 (`*.api.test.ts`) | Auth、組織 CRUD、頻道 CRUD、權限 | Phase 2 後 |
| WebSocket 測試 (`*.ws.test.ts`) | 訊息收發、typing、已讀、撤回、速率限制、斷線重連 gap fill | Phase 2 後 |
| UI 測試 (`*.ui.test.ts`) | 登入流程、聊天互動、圖片上傳 | Phase 3 後 |

### 已完成的測試案例

**Auth（4 cases）：** 建立使用者、取得 /me、無效 token 拒絕、無 token 拒絕

**組織 + 頻道（6 cases）：** 建立組織、列出組織、邀請成員、建立頻道、建立 DM、slug 碰撞、非 admin 邀請被拒

**WebSocket 訊息（6 cases）：** 即時收發、typing indicator、訊息撤回 + 稽核日誌、已讀水位線更新、速率限制、非成員發送被拒

**斷線重連（1 case）：** 斷線期間訊息 → 重連後 gap fill API 取回

**Phase 3 API（10 cases）：** 檔案上傳（multipart + base64 paste + 拒絕禁止類型）、搜尋（匹配 / 無結果 / 短查詢拒絕）、反應（新增 / 群組計數 / toggle 移除）、URL 預覽（OG 取得 / 無效 URL 拒絕）

**Phase 3 WebSocket（2 cases）：** 反應廣播 reaction:updated、訊息回覆帶 replyToId

### 執行方式

```bash
# 需先啟動 docker compose + dev server
bun run test:e2e          # 全部測試
bun run test:e2e:ui       # Playwright UI 模式
```

---

## 資料模型

```prisma
// ============================================================
// 組織
// ============================================================

model Organization {
  id       String        @id @default(cuid())
  name     String
  slug     String        @unique
  members  OrgMember[]
  channels Channel[]
  settings OrgSettings?
}

model OrgSettings {
  id                String       @id @default(cuid())
  orgId             String       @unique
  org               Organization @relation(fields: [orgId], references: [id])
  messageRetainDays Int?         // null = 永久保留
}

model OrgMember {
  id     String       @id @default(cuid())
  userId String
  orgId  String
  role   String       @default("member") // admin | member | guest
  user   User         @relation(fields: [userId], references: [id])
  org    Organization @relation(fields: [orgId], references: [id])
  @@unique([userId, orgId])
}

// ============================================================
// 使用者
// ============================================================

model User {
  id        String    @id @default(cuid())
  email     String    @unique
  name      String
  avatar    String?
  sub       String?   // OIDC subject (Keycloak user ID)
  provider  String?   // keycloak | google | github
  isBot     Boolean   @default(false)
  status    String    @default("offline")
  createdAt DateTime  @default(now())

  orgMemberships     OrgMember[]
  channelMemberships ChannelMember[]
  sentMessages       Message[]          @relation("sender")
  reactions          Reaction[]
  readCursors        ChannelReadCursor[]
  pushSubscriptions  PushSubscription[]
}

// ============================================================
// 頻道 / 群組
// ============================================================

model Channel {
  id        String          @id @default(cuid())
  name      String
  type      String          @default("group") // group | dm | readonly
  isPrivate Boolean         @default(false)
  orgId     String
  org       Organization    @relation(fields: [orgId], references: [id])
  members   ChannelMember[]
  messages  Message[]
  createdAt DateTime        @default(now())
}

model ChannelMember {
  id        String  @id @default(cuid())
  userId    String
  channelId String
  role      String  @default("member") // admin | member
  user      User    @relation(fields: [userId], references: [id])
  channel   Channel @relation(fields: [channelId], references: [id])
  @@unique([userId, channelId])
}

// ============================================================
// 訊息
// ============================================================

model Message {
  id          String       @id @default(cuid())
  content     String
  type        String       @default("text") // text | image | file | system
  channelId   String
  senderId    String
  replyToId   String?
  isRetracted Boolean      @default(false)
  editedAt    DateTime?
  channel     Channel      @relation(fields: [channelId], references: [id])
  sender      User         @relation("sender", fields: [senderId], references: [id])
  replyTo     Message?     @relation("thread", fields: [replyToId], references: [id])
  replies     Message[]    @relation("thread")
  reactions   Reaction[]
  attachments Attachment[]
  createdAt   DateTime     @default(now())

  @@index([channelId, createdAt])  // 訊息分頁查詢
}

// ============================================================
// 已讀水位線（取代 MessageRead，避免資料膨脹）
// ============================================================
// 每人每頻道只存一筆。
// 已讀人數 = COUNT(ChannelReadCursor WHERE lastReadMsgId >= targetMsgId)

model ChannelReadCursor {
  id            String   @id @default(cuid())
  userId        String
  channelId     String
  lastReadMsgId String
  lastReadAt    DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id])
  @@unique([userId, channelId])
  @@index([channelId, lastReadMsgId])  // 已讀人數 COUNT 查詢
}

// ============================================================
// 反應 / 附件
// ============================================================

model Reaction {
  id        String  @id @default(cuid())
  emoji     String
  messageId String
  userId    String
  message   Message @relation(fields: [messageId], references: [id])
  user      User    @relation(fields: [userId], references: [id])
  @@unique([messageId, userId, emoji])
}

model Attachment {
  id        String  @id @default(cuid())
  name      String
  url       String
  mimeType  String
  size      Int
  messageId String
  message   Message @relation(fields: [messageId], references: [id])
}

// ============================================================
// 稽核日誌
// ============================================================

model AuditLog {
  id        String   @id @default(cuid())
  orgId     String
  action    String   // message_retract | message_delete | member_kick | channel_create | ...
  actorId   String   // 操作者
  targetId  String?  // 被操作的對象 ID
  meta      Json?    // 附加資訊（如撤回的訊息內容快照）
  createdAt DateTime @default(now())

  @@index([orgId, createdAt])  // 按組織查詢稽核紀錄
  @@index([actorId])
}

// ============================================================
// AI 助理
// ============================================================

model AIAssistant {
  id           String               @id @default(cuid())
  orgId        String
  name         String
  avatar       String?
  systemPrompt String
  baseUrl      String               // OpenAI-compatible endpoint
  apiKeyEnc    String               // AES-256-GCM 加密儲存
  model        String               // e.g. gpt-4o, llama3, claude-sonnet
  maxContext   Int                   @default(20)
  isActive     Boolean              @default(true)
  botUserId    String               @unique
  botUser      User                 @relation(fields: [botUserId], references: [id])
  channels     AIAssistantChannel[]
  createdAt    DateTime             @default(now())
}

model AIAssistantChannel {
  id          String      @id @default(cuid())
  assistantId String
  channelId   String
  assistant   AIAssistant @relation(fields: [assistantId], references: [id])
  @@unique([assistantId, channelId])
}

// ============================================================
// Integration API（Phase 7）
// ============================================================

model Integration {
  id          String   @id @default(cuid())
  orgId       String
  name        String              // e.g. "n8n 生產環境", "監控系統"
  description String?
  apiKey      String   @unique    // sha256 hash 儲存，明文只在建立時顯示一次
  webhookUrl  String?             // 事件回呼 URL
  permissions Json     @default("[]") // 允許的操作 ["push","broadcast","read"]
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  @@index([orgId])
}

// ============================================================
// 推播訂閱
// ============================================================

model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique
  keys      Json     // VAPID p256dh + auth
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())
}
```

---

## 規模設計（20,000 使用者）

### WebSocket 跨節點廣播

單節點 Bun 可承載約 5,000–10,000 WebSocket 連線，20,000 人需 2–4 個 App 節點。
節點間透過 **Redis Pub/Sub** 同步訊息廣播：

```
使用者 A (節點 1) 發送訊息
    │
    ▼
節點 1 寫入 PostgreSQL
    │
    ├─▶ 直接推送給連線在節點 1 的使用者
    │
    └─▶ Redis PUBLISH channel:<id>
            │
            ├─▶ 節點 2 SUBSCRIBE → 推送給其連線使用者
            └─▶ 節點 3 SUBSCRIBE → 推送給其連線使用者
```

### WebSocket 連線管理重點

- **Sticky session：** Caddy 使用 IP hash 或 cookie affinity，確保 WebSocket upgrade 不被分到不同節點
- **斷線重連：** Client 斷線後自動重連，帶上 `lastReceivedMsgId`，Server 回填斷線期間的訊息
- **速率限制：** 每人每秒最多 N 則訊息，超過直接丟棄並通知 Client
- **心跳：** Client 每 30 秒 ping，Server 60 秒未收到 ping 判定離線

### Presence（在線狀態）大規模策略

20,000 人不能每次上下線都廣播全域，改為：
- 只通知**同頻道成員**的 presence 變化
- 批次彙總：每 5 秒收集一次 presence 變化，合併後一次推送
- Redis SET 儲存全域在線名單，Client 進入頻道時查詢該頻道成員在線狀態

### 部署架構（生產環境）

```
┌──────────────────────────────────────────────────────┐
│                   docker-compose                     │
│                                                      │
│  ┌──────────────┐                                    │
│  │    Caddy      │── /api, /ws ──▶ App 節點 1        │
│  │  (HTTPS +     │── /api, /ws ──▶ App 節點 2  ─┐   │
│  │  LB + sticky) │── /api, /ws ──▶ App 節點 3   │   │
│  └──────────────┘                               │   │
│                                                  │   │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │   │
│  │  MinIO   │  │  PostgreSQL  │  │   Redis    │◀─┘   │
│  │  (檔案)  │  │  + pgroonga  │  │ (Pub/Sub)  │      │
│  └──────────┘  └──────────────┘  └───────────┘      │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │  Keycloak（可選自架）                          │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

> **規模成長路徑：** 若超過 20,000 人或需要高可用，可從 docker-compose 遷移至
> Docker Swarm（簡單）或 Kubernetes（完整），架構設計已考慮水平擴展。

---

## 推播通知架構

### 策略：WebSocket + Web Push VAPID（完全自架）

```
有新訊息
    │
    ├─ 使用者在線（WebSocket 連線中）
    │      └─▶ 直接 WebSocket push
    │
    └─ 使用者離線 / App 關閉
           │
           ├─▶ Web Push (VAPID) ── 瀏覽器 / PWA（桌面+手機）
           ├─▶ OS 原生通知 ────── Desktop App (Tauri)
           └─▶ Email fallback ─── 離線超過閾值時
```

| 平台 | 機制 | 第三方依賴 |
|------|------|-----------|
| Web / PWA 桌面 | Web Push API + VAPID | 僅瀏覽器廠商（payload 端對端加密） |
| Mobile PWA (iOS Safari 16.4+ / Android Chrome) | Web Push API + VAPID | 同上 |
| Desktop App (Tauri) | OS 原生通知 API | 無 |
| Email fallback | SMTP（企業 mail server） | 無 |

**VAPID 金鑰自產：**
```bash
npx web-push generate-vapid-keys
```

---

## 外網存取策略

### 採用方案：公網直接開放（方案 B）

Caddy 綁定公開 domain，全球可存取，安全強化措施：

- Keycloak 負責所有身份驗證，**強制 MFA**
- XekuChat Server 只信任 Keycloak 簽發的 OIDC token
- Caddy 自動 HTTPS (TLS)
- Rate limiting 防暴力攻擊
- 安全 HTTP headers (HSTS, CSP, X-Frame-Options)

### 備註：零信任選項（方案 C）

> 若未來有更高安全需求，可改用 **Cloudflare Tunnel**：
> - 伺服器不需開放任何 inbound port，無需公網 IP
> - 由 `cloudflared` container 建立 outbound 加密隧道至 Cloudflare Edge
> - 可疊加 Cloudflare Access 做第二層 Zero Trust 身份驗證
> - 遷移成本低，docker-compose 加一個 container 即可

---

## Auth 流程（以 Keycloak 為例）

```
Browser                XekuChat Server           Keycloak
   │                         │                       │
   │── GET /auth/login ──────▶│                       │
   │                         │── redirect ──────────▶│
   │◀────────────── redirect to Keycloak login page ──│
   │── 使用者輸入帳密 ──────────────────────────────────▶│
   │                         │◀── authorization_code ─│
   │                         │── exchange code ───────▶│
   │                         │◀── id_token + access_token
   │                         │  (含 email, name, groups)
   │                         │── upsert User in DB    │
   │◀── Set JWT cookie ───────│                       │
```

**Keycloak 整合重點：**
- 透過 OIDC Discovery (`/.well-known/openid-configuration`) 自動取得端點
- 從 `id_token` claims 取得 `sub`、`email`、`name`、`picture`
- 可選：從 Keycloak groups/roles 同步到 XekuChat 的組織/角色
- Keycloak 可串接企業 AD/LDAP，XekuChat 無需處理密碼

**docker-compose 加入 Keycloak（可選自架）：**
```yaml
keycloak:
  image: quay.io/keycloak/keycloak:latest
  command: start-dev
  environment:
    KC_DB: postgres
    KEYCLOAK_ADMIN: admin
    KEYCLOAK_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
  ports:
    - "8080:8080"
```

---

## 專案結構（規劃）

```
xekuchat/
├── packages/
│   ├── server/          # Bun + Hono API + WebSocket
│   │   ├── src/
│   │   │   ├── routes/       # REST API routes
│   │   │   ├── ws/           # WebSocket handlers
│   │   │   ├── lib/          # Prisma + Redis 連線
│   │   │   ├── auth/         # OIDC + JWT
│   │   │   ├── audit/        # 稽核日誌
│   │   │   └── ai/           # AI 助理 LLM 整合
│   │   └── prisma/
│   │       └── schema.prisma
│   ├── client/          # React 19 SPA + PWA Service Worker
│   │   ├── src/
│   │   │   ├── components/   # UI 元件
│   │   │   ├── pages/        # 頁面
│   │   │   ├── hooks/        # useWebSocket, useChat, useAuth
│   │   │   ├── i18n/         # i18next (en / zh-TW)
│   │   │   └── sw/           # Service Worker (Web Push)
│   │   └── public/
│   ├── core/            # 共用型別、常數
│   └── e2e/             # Playwright e2e 測試
│       └── tests/
│           ├── auth.api.test.ts
│           ├── org-channel.api.test.ts
│           ├── messaging.ws.test.ts
│           └── reconnect.ws.test.ts
├── docker/
│   └── postgres/init.sql     # pgroonga 初始化
├── docker-compose.yml        # 開發環境
├── docker-compose.prod.yml   # 生產環境（多節點）
├── Dockerfile                # 多階段建置
├── Caddyfile
├── .env.example
└── PLAN.md
```

---

## 開發路線圖

| 階段 | 內容 | 備註 |
|------|------|------|
| Phase 1 | 基礎架構 + 組織骨架 + Auth + Docker | Keycloak OIDC、Redis、PostgreSQL + pgroonga、稽核日誌 |
| Phase 2 | WebSocket 即時通訊核心 | Redis Pub/Sub、sticky session、斷線重連、已讀水位線、訊息撤回 |
| Phase 3 | 訊息豐富功能 | tus 大檔上傳、連結預覽、pgroonga 中文搜尋 |
| Phase 4 | 進階組織與權限管理 | 頻道權限、Web Push、Presence 優化 |
| Phase 5 | 多平台 | PWA、Tauri Desktop |
| Phase 6 | AI 聊天助理 | LLM 整合、DM + @mention、Streaming |
| Phase 7 | 維運強化 + Integration API | 類 LINE Messaging API、Webhook、Tool Use / RAG、通話、備份、監控 |

---

*最後更新：2026-03-16*
