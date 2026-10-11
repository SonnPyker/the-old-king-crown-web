// Player-facing rules text for the zoom of basic cards: Archetypes, Commands and Traits, following the rulebook (pg. 36-40).
// The printed text of Kingdom Cards, Tactics, Advanced and HQ cards is in face_text.js.
// Game terms are marked **Term**: ui/cards.js shows them in bold with the explanation from data/glossary.js.

// ---------------------------------------------------------------- Commands (rulebook, pg. 36-40)
export const COMMAND_DESC = {
  ambush: {
    vi: '**Ambush** (tùy chọn, mỗi lá một lần mỗi **Clash**): đặt một lá úp từ **Hand** vào **Region** đang **Clash**. Lá đó được lật lên và tham gia **Clash**.',
    en: '**Ambush** (optional, once per card per **Clash**): place a face-down card from your **Hand** into the **Region**. It is revealed and joins the **Clash**.',
  },
  retreat: {
    vi: '**Retreat** (tùy chọn, mỗi lá một lần mỗi **Clash**): nếu lá này đang **Active** trong **Clash**, đưa mọi lá **Active** của bạn trong **Region** đó về **Hand** (kể cả lá này). Có thể đưa **Herald** và **Supporter** của bạn trong **Region** về bảng.',
    en: '**Retreat** (optional, once per card per **Clash**): if this card is **Active** in the **Clash**, return your **Active** cards in its **Region** to your **Hand** (including this one). You may also return your **Herald** and **Supporters** there to your board.',
  },
  flank: {
    vi: '**Flank** (tùy chọn, mỗi lá một lần mỗi **Clash**): nếu lá này đang **Active** trong **Clash**, chuyển nó sang một **Region** khác chưa giải quyết. Lá đó **Active** ở **Region** mới và không còn trong **Clash** hiện tại.',
    en: '**Flank** (optional, once per card per **Clash**): if this card is **Active** in the **Clash**, move it to another unresolved **Region**. It becomes **Active** there and leaves the current **Clash**.',
  },
  rally: {
    vi: '**Rally** (tùy chọn, mỗi bước một lần): nếu lá này đang **Active**, đưa về **Hand** chính nó (**Rally** bản thân) hoặc tối đa X lá **Active** của bạn, có thể gồm lá này (**Rally** X).',
    en: '**Rally** (optional, once per listed Step): if this card is **Active**, return it to your **Hand** (**Rally** Self) or up to X of your **Active** cards, which may include this one (**Rally** Any X).',
  },
  deploy: {
    vi: '**Deploy** X (tùy chọn, mỗi bước một lần): từ **Hand**, đặt lá này mặt ngửa cạnh một **Region**. Lá đó **Active** và đặt X **Influence** lấy từ **Reserve** lên nó. Ở bước dọn **Winter**, **Influence** được trả về **Reserve**, lá vẫn ở **Region**.',
    en: '**Deploy** X (optional, once per listed Step): from your **Hand**, place this card face-up next to a **Region**. It becomes **Active** and X **Influence** from the Reserve is placed on it. In **Winter** Cleanup the **Influence** returns to the Reserve; the card stays in the **Region**.',
  },
  deadly: {
    vi: '**Deadly** (bắt buộc, đồng thời): nếu lá này đang **Active** trong **Clash**, **Eliminate** mọi lá **Active** của đối thủ trong **Clash** (chuyển vào **Lost Pile**). Lá **Invulnerable** không bị **Eliminate**.',
    en: '**Deadly** (mandatory, simultaneous): if this card is **Active** in the **Clash**, **Eliminate** all opponents’ **Active** cards in it (moved to the **Lost Pile**). **Invulnerable** cards are not **Eliminated**.',
  },
};

// ---------------------------------------------------------------- Traits (rulebook, pg. 40-41)
export const TRAIT_DESC = {
  inv: {
    vi: '**Invulnerable** (I): không thể bị **Eliminate** bởi **Deadly** hoặc bất kỳ hiệu ứng nào khác.',
    en: '**Invulnerable** (I): cannot be **Eliminated** by **Deadly** or by any other effect.',
  },
  res: {
    vi: '**Resilient** (R): khi bị **Eliminate**, đưa về **Discard** bài thay vì **Lost Pile**.',
    en: '**Resilient** (R): when **Eliminated**, goes to the **Discard Pile** instead of the **Lost Pile**.',
  },
  path: {
    vi: '**Pathfinder** (P): khi dùng để **Journey**, đưa về **Discard** bài thay vì **Lost Pile** (vẫn nhận đủ **Lore**).',
    en: '**Pathfinder** (P): when used to **Journey**, goes to the **Discard Pile** instead of the **Lost Pile** (you still gain the **Lore**).',
  },
};

// ---------------------------------------------------------------- Basic Faction Card roles (by Archetype)
export const ARCH_DESC = {
  ruse: {
    vi: '**Ruse**: **Strength** 0 nhưng **Invulnerable**. Có **Ambush** và **Retreat** (**Day**); mỗi **Clash** chỉ dùng được một trong hai.',
    en: '**Ruse**: **Strength** 0 but **Invulnerable**. Has **Ambush** and **Retreat** (**Day**); only one of the two can be used per **Clash**.',
  },
  trader: {
    vi: '**Trader**: 2 **Votes**, 2 **Lore**. **Rally** (**Autumn**): đưa tối đa 2 lá **Active** của bạn về **Hand**.',
    en: '**Trader**: 2 **votes**, 2 **Lore**. **Rally** (**Autumn**, Any Two): return up to 2 of your **Active** cards to your **Hand**.',
  },
  follower: {
    vi: '**Follower**: **Strength** thấp nhưng **Invulnerable**, 1 **Lore**. Không có Lệnh.',
    en: '**Follower**: low **Strength** but **Invulnerable**, 1 **Lore**. No Commands.',
  },
  agent: {
    vi: '**Agent**: **Deadly** (**Night**). **Night Effect**: tự **Eliminate** nếu có **Follower** đối thủ đang **Active** trong **Clash**.',
    en: '**Agent**: **Deadly** (**Night**). **Night effect**: **Eliminates** itself if an opponent’s **Follower** is **Active** in the **Clash**.',
  },
  cavalry: {
    vi: '**Cavalry**: **Flank** (**Day**) sang **Region** khác; **Pathfinder** khi **Journey**.',
    en: '**Cavalry**: **Flank** (**Day**) to another **Region**; **Pathfinder**.',
  },
  warmachine: {
    vi: '**War Machine**: **Invulnerable**; **Deploy** 1 (**Autumn**) để đặt lên một **Region**.',
    en: '**War Machine**: **Invulnerable**; **Deploy** 1 (**Autumn**) to a **Region**.',
  },
  captain: {
    vi: '**Captain**: **Strength** cao; **Pathfinder**.',
    en: '**Captain**: high **Strength**; **Pathfinder**.',
  },
  heir: {
    vi: '**Heir**: **Strength** 10, **Resilient**, **Pathfinder**. **Rally** bản thân (**Autumn**): đưa chính nó về **Hand**.',
    en: '**Heir**: **Strength** 10, **Resilient**, **Pathfinder**. **Rally** Self (**Autumn**): return itself to your **Hand**.',
  },
};

// ---------------------------------------------------------------- Kingdom's Favour (one per Faction)
export const KF_DESC = {
  nobility: {
    vi: 'Chọn một: nhận 1 **Influence**, hoặc **Heir** của bạn **Invulnerable** đến hết **Round**.',
    en: 'Choose one: gain 1 **Influence**, or your **Heirs** are **Invulnerable** until the end of the **Round**.',
  },
  uprising: {
    vi: 'Chọn một **Region** và xem các lá úp ở đó. Sau đó có thể **Swap** một lá úp của bạn với một lá trên **Hand** hoặc một lá đang **Occupying** của bạn.',
    en: 'Choose a **Region** and look at its face-down cards. Then you may **swap** one of your face-down cards with a card in your **Hand** or one of your **Occupying** cards.',
  },
  clans: {
    vi: 'Trong **Clash** này: đặt **Herald** của bạn lên một **Location** trong **Region**. Sau đó có thể chuyển tối đa 2 **Supporter** từ các **Region** khác sang **Region** đang **Clash**.',
    en: 'In this **Clash**: place your **Herald** on a **Location** in the **Region**. Then you may move up to 2 **Supporters** from other **Regions** into the **Region** in the **Clash**.',
  },
  gathering: {
    vi: 'Nếu **Herald** của bạn ở một **Region** có lá **Active** của bạn: đưa một lá **Active** đó về **Hand**.',
    en: 'If your **Herald** is in a **Region** with one of your **Active** cards: return that **Active** card to your **Hand**.',
  },
};
