// Glossary of game terms: the reference table (ui/app.js, glossaryModal) and the term marks in card text.
// In card text a game term is written **Term** (data/face_text.js, data/descriptions.js). The UI shows it in bold,
// in English as printed on the card, with its explanation as a tooltip. `forms` lists the English spellings that
// the marks match (the tooltip lookup is case-insensitive). Archetype, Command and Trait explanations are shared
// with descriptions.js, so they are read from there.
import { ARCH_DESC, COMMAND_DESC, TRAIT_DESC } from './descriptions.js';

// Strip the **term** marks from a shared explanation, so the table and tooltips show plain text.
const plain = (d) => ({ vi: d.vi.replace(/\*\*/g, ''), en: d.en.replace(/\*\*/g, '') });
// Archetype text starts with the name ("Ruse: ..."); the table shows only the part after the name.
const role = (d) => {
  const p = plain(d);
  return { vi: p.vi.replace(/^[^:]*:\s*/, ''), en: p.en.replace(/^[^:]*:\s*/, '') };
};

export const GLOSSARY_GROUPS = ['round', 'map', 'zone', 'res', 'act', 'unit'];

export const GLOSSARY = [
  // ---------------------------------------------------------------- Năm & Mùa
  { id: 'round', group: 'round', en: 'Round', forms: ['Round', 'Rounds', 'Year', 'Years', 'Start of the Year', 'Start of Year'], vi: 'Năm',
    def: {
      vi: 'Một năm của trò chơi: đầu năm, rồi Mùa Xuân, Mùa Hạ, Mùa Thu và Mùa Đông. Thẻ ghi “Round” khi hiệu lực kéo dài đến hết năm đó.',
      en: 'One year of the game: start of the Year, then Spring, Summer, Autumn and Winter. Cards say “Round” when an effect lasts until the end of that Year.',
    } },
  { id: 'spring', group: 'round', en: 'Spring', forms: ['Spring'], vi: 'Mùa Xuân',
    def: { vi: 'Mùa đầu tiên của năm: người chơi thực hiện các Hành động Xuân.', en: 'First season of the Year: players take their Spring Actions.' } },
  { id: 'summer', group: 'round', en: 'Summer', forms: ['Summer'], vi: 'Mùa Hạ',
    def: { vi: 'Giai đoạn Giao tranh: các Clash diễn ra ở ba Vùng.', en: 'Clash phase: the Clashes are fought in the three Regions.' } },
  { id: 'autumn', group: 'round', en: 'Autumn', forms: ['Autumn'], vi: 'Mùa Thu',
    def: { vi: 'Mùa có các Hành động Thu: người chơi dùng các lá có hiệu ứng Thu.', en: 'Season of the Autumn Actions: players use cards with an Autumn effect.' } },
  { id: 'winter', group: 'round', en: 'Winter', forms: ['Winter'], vi: 'Mùa Đông',
    def: {
      vi: 'Dọn dẹp cuối năm. Ảnh hưởng đặt bằng Triển khai được trả về Reserve; lá vẫn ở Vùng.',
      en: 'Winter cleanup at the end of the Year. Influence placed by Deploy returns to the Reserve; the cards stay in their Regions.',
    } },
  { id: 'spring_action', group: 'round', en: 'Spring Action', forms: ['Spring Action', 'Spring Actions'], vi: 'Hành động Xuân',
    def: { vi: 'Bước hành động Mùa Xuân: người chơi dùng các lá có hiệu ứng Xuân.', en: 'Spring action step: players use cards with a Spring effect.' } },
  { id: 'autumn_action', group: 'round', en: 'Autumn Action', forms: ['Autumn Action', 'Autumn Actions'], vi: 'Hành động Thu',
    def: { vi: 'Bước hành động Mùa Thu: người chơi dùng các lá có hiệu ứng Thu.', en: 'Autumn action step: players use cards with an Autumn effect.' } },
  { id: 'day_action', group: 'round', en: 'Day Action', forms: ['Day Action', 'Day Actions'], vi: 'Hành động Ban ngày',
    def: { vi: 'Hành động trong bước Ban ngày của Clash: các lá Active có hiệu ứng (Ban ngày) được dùng.', en: 'Action in the Day step of a Clash: Active cards with a (Day) effect are used.' } },
  { id: 'day', group: 'round', en: 'Day', forms: ['Day'], vi: 'Ban ngày',
    def: { vi: 'Bước Ban ngày của Clash, nơi các hành động Ban ngày được thực hiện.', en: 'Day step of a Clash, where Day actions are taken.' } },
  { id: 'night', group: 'round', en: 'Night', forms: ['Night'], vi: 'Ban đêm',
    def: { vi: 'Bước Ban đêm của Clash, nơi các Hiệu ứng ban đêm được kích hoạt.', en: 'Night step of a Clash, where Night Effects are triggered.' } },
  { id: 'night_effect', group: 'round', en: 'Night Effect', forms: ['Night Effect', 'Night Effects'], vi: 'Hiệu ứng ban đêm',
    def: { vi: 'Hiệu ứng in trên lá, kích hoạt ở bước Ban đêm của Clash.', en: 'Effect printed on a card, triggered in the Night step of a Clash.' } },
  { id: 'attrition', group: 'round', en: 'Attrition', forms: ['Attrition'], vi: 'Hao mòn',
    def: {
      vi: 'Khi Bộ bài hết mà còn phải rút: xáo Bài bỏ thành Bộ bài mới và giảm Giới hạn tay bài 1. Nếu bỏ được Mysterious Benefactor thay thế thì không giảm.',
      en: 'When your Deck runs out while drawing: shuffle your Discard Pile into a new Deck and reduce your Hand Size by 1. Discarding Mysterious Benefactor instead avoids the reduction.',
    } },
  { id: 'order_track', group: 'round', en: 'Order Track', forms: ['Order Track'], vi: 'Đường thứ tự lượt',
    def: {
      vi: 'Thứ tự lượt trong năm. Đầu mỗi năm (từ năm thứ hai), thứ tự được xếp lại theo Ảnh hưởng: nhiều Ảnh hưởng hơn đi trước. Người “đi đầu” là người đứng trước trong thứ tự này.',
      en: 'The turn order for the Year. At the start of each Year (from the second), the order is reset by Influence: more Influence goes first. The player “first” is the one at the front of this order.',
    } },

  // ---------------------------------------------------------------- Bản đồ & Hội đồng
  { id: 'region', group: 'map', en: 'Region', forms: ['Region', 'Regions'], vi: 'Vùng',
    def: {
      vi: 'Một trong ba Vùng trên Bản đồ. Lá được đặt vào Vùng, và Giao tranh diễn ra ở từng Vùng.',
      en: 'One of three Regions on the Map. Cards are placed in Regions, and Clashes are fought in each Region.',
    } },
  { id: 'clash', group: 'map', en: 'Clash', forms: ['Clash', 'Clashes'], vi: 'Giao tranh',
    def: {
      vi: 'Trận đấu ở một Vùng trong Mùa Hạ, quyết định bằng tổng Sức mạnh các lá Active ở Vùng đó.',
      en: 'A fight in one Region during Summer, decided by the total Strength of the Active cards there.',
    } },
  { id: 'active', group: 'map', en: 'Active', forms: ['Active'], vi: 'Active',
    def: { vi: 'Trạng thái của lá đang nằm trong một Vùng và tham gia Clash ở Vùng đó.', en: 'State of a card that is in a Region and takes part in the Clash there.' } },
  { id: 'council', group: 'map', en: 'Council', forms: ['Council', 'Councils'], vi: 'Hội đồng',
    def: {
      vi: 'Ba Hội đồng (Thánh vật, Bí mật, Lời thề). Lá được Cai trị vào Hội đồng, và số Phiếu trong Hội đồng quyết định phần thưởng ở đó.',
      en: 'Three Councils (Relics, Secrets, Oaths). Cards are Governed into a Council, and your Votes there decide the rewards.',
    } },
  { id: 'govern', group: 'map', en: 'Govern', forms: ['Govern', 'Governs', 'Governed'], vi: 'Cai trị',
    def: { vi: 'Đưa một lá của bạn vào một Hội đồng.', en: 'Put one of your cards into a Council.' } },
  { id: 'location', group: 'map', en: 'Location', forms: ['Location', 'Locations'], vi: 'Địa điểm',
    def: {
      vi: 'Ô nằm trong các Vùng: Lâu đài, Hoang dã, Cánh đồng, Chiến trường, Đền thờ và Nghĩa địa. Mỗi Địa điểm có một Phần thưởng riêng.',
      en: 'Spots inside the Regions: Castle, Wilderness, Harvest Field, Battlefield, Shrine and Necropolis. Each Location has its own reward.',
    } },
  { id: 'location_reward', group: 'map', en: 'Location Reward', forms: ['Location Reward', 'Location Rewards'], vi: 'Phần thưởng Địa điểm',
    def: { vi: 'Hiệu ứng in trên mỗi Địa điểm. Người chơi nhận nó khi đủ điều kiện.', en: 'The effect printed on each Location. A player claims it when the condition is met.' } },
  { id: 'site_of_power', group: 'map', en: 'Site of Power', forms: ['Site of Power'], vi: 'Nơi Quyền năng',
    def: { vi: 'Khu vực trên bảng của bạn, chứa các lá có Chi phí Tri thức (Lore Cost).', en: 'Area on your board that holds cards with a Lore Cost.' } },
  { id: 'lore_cost', group: 'map', en: 'Lore Cost', forms: ['Lore Cost'], vi: 'Chi phí Tri thức',
    def: { vi: 'Số Tri thức ghi trên một lá ở Nơi Quyền năng. Phải trả đủ để nhận lá đó.', en: 'The Lore printed for a card on the Site of Power. You must pay it to take that card.' } },
  { id: 'great_road', group: 'map', en: 'Great Road', forms: ['Great Road'], vi: 'Đại lộ',
    def: { vi: 'Dãy Thẻ Vương quốc mặt ngửa. Bạn có thể lấy thẻ từ đây bằng Đấu giá.', en: 'Row of face-up Kingdom Cards. You can take cards from here by Bidding.' } },
  { id: 'kingdom_deck', group: 'map', en: 'Kingdom Deck', forms: ['Kingdom Deck'], vi: 'Bộ Vương quốc',
    def: { vi: 'Bộ Thẻ Vương quốc úp. Các thẻ từ đây được đưa lên Đại lộ.', en: 'Face-down deck of Kingdom Cards. Cards from here are placed on the Great Road.' } },
  { id: 'kingdom_discard', group: 'map', en: 'Kingdom Discard', forms: ['Kingdom Discard'], vi: 'Bỏ (Đại lộ)',
    def: { vi: 'Nơi chứa các Thẻ Vương quốc đã bỏ khỏi Đại lộ.', en: 'Where Kingdom Cards discarded from the Great Road go.' } },
  { id: 'marker', group: 'map', en: 'Marker', forms: ['Marker', 'Markers', 'Faction Marker', 'Faction Markers'], vi: 'Dấu',
    def: {
      vi: 'Dấu Faction của bạn. Đặt lên Hội đồng (mỗi Dấu cho 1 Phiếu trong Hội đồng đó), lên Địa điểm (Hội đồng Bí mật), hoặc lên Chiến thuật và thẻ HQ. Gỡ Dấu khi dùng.',
      en: 'Your Faction Marker. Placed on a Council (each gives 1 Vote there), on a Location (Council of Secrets), or on a Tactic or HQ card. Removed when used.',
    } },
  { id: 'clash_marker', group: 'map', en: 'Clash Marker', forms: ['Clash Marker', 'Clash Markers'], vi: 'Dấu Giao tranh',
    def: { vi: 'Trong Mùa Hạ, Dấu Giao tranh được đặt lên các Vùng để định thứ tự Giao tranh trong năm.', en: 'In Summer, Clash Markers are placed on the Regions to set the order of the Clashes in the Year.' } },

  // ---------------------------------------------------------------- Khu vực & bài
  { id: 'hand', group: 'zone', en: 'Hand', forms: ['Hand', 'Hands'], vi: 'Tay bài',
    def: { vi: 'Các lá bạn đang cầm. Số lá tối đa là Giới hạn tay bài (Hand Size).', en: 'Cards you hold. The maximum is your Hand Size.' } },
  { id: 'hand_size', group: 'zone', en: 'Hand Size', forms: ['Hand Size'], vi: 'Giới hạn tay bài',
    def: { vi: 'Số lá tối đa được giữ trên tay. Giảm khi có Hao mòn; một số thẻ làm tăng hoặc giảm thêm.', en: 'Maximum number of cards you may hold. Reduced by Attrition; some cards raise or lower it further.' } },
  { id: 'deck', group: 'zone', en: 'Deck', forms: ['Deck', 'Decks'], vi: 'Bộ bài',
    def: { vi: 'Bộ bài úp của bạn, bạn rút lá từ đây. Khi hết mà còn phải rút, có Hao mòn.', en: 'Your face-down deck, which you draw from. When it runs out while drawing, Attrition happens.' } },
  { id: 'discard_pile', group: 'zone', en: 'Discard Pile', forms: ['Discard Pile', 'Discard Piles'], vi: 'Bài bỏ',
    def: { vi: 'Nơi chứa các lá đã bỏ. Khi Bộ bài hết, Bài bỏ được xáo thành Bộ bài mới (xem Hao mòn).', en: 'Where discarded cards go. When your Deck runs out, the Discard Pile is shuffled into a new Deck (see Attrition).' } },
  { id: 'discard', group: 'zone', en: 'Discard', forms: ['Discard', 'Discards', 'Discarded'], vi: 'Bỏ',
    def: { vi: 'Đưa một lá xuống Bài bỏ (Discard Pile).', en: 'Put a card into your Discard Pile.' } },
  { id: 'lost_pile', group: 'zone', en: 'Lost Pile', forms: ['Lost Pile', 'Lost Piles'], vi: 'Thất lạc',
    def: { vi: 'Nơi các lá bị Loại bỏ (Eliminate). Lá Kiên cường thay vào đó về Bài bỏ.', en: 'Where Eliminated cards go. Resilient cards go to the Discard Pile instead.' } },
  { id: 'supply', group: 'zone', en: 'Supply', forms: ['Supply'], vi: 'Kho',
    def: { vi: 'Kho của bạn: chứa Ảnh hưởng và Tri thức chưa dùng, và các Thẻ Vương quốc chưa đặt lên bảng.', en: 'Your reserve: holds the Influence and Lore not yet in use, and Kingdom Cards not yet on the board.' } },
  { id: 'burn', group: 'zone', en: 'Burn', forms: ['Burn', 'Burns', 'Burned', 'Burning'], vi: 'Đốt',
    def: { vi: 'Đưa lá hoặc Chiến thuật ra khỏi trò chơi (vào khu vực Đã đốt). Lá đã đốt không dùng lại được.', en: 'Remove a card or Tactic from the game (to the Burned area). A burned card cannot be used again.' } },
  { id: 'eliminate', group: 'zone', en: 'Eliminate', forms: ['Eliminate', 'Eliminated', 'Eliminates', 'Eliminating'], vi: 'Loại bỏ',
    def: {
      vi: 'Đưa lá vào Thất lạc (Lost Pile). Lá Kiên cường về Bài bỏ thay vì Thất lạc. Lá Bất khả xâm phạm không bị Chí mạng loại bỏ.',
      en: 'Move a card to the Lost Pile. Resilient cards go to the Discard Pile instead. Invulnerable cards are not Eliminated by Deadly.',
    } },

  // ---------------------------------------------------------------- Tài nguyên & Sức mạnh
  { id: 'influence', group: 'res', en: 'Influence', forms: ['Influence'], vi: 'Ảnh hưởng',
    def: { vi: 'Tài nguyên tính điểm cuối ván. Nhận từ nhiều hiệu ứng, từ Clash và từ Phần thưởng Địa điểm.', en: 'Resource that scores at the end of the game. Gained from many effects, from Clashes and from Location rewards.' } },
  { id: 'lore', group: 'res', en: 'Lore', forms: ['Lore'], vi: 'Tri thức',
    def: { vi: 'Tài nguyên dùng để trả Chi phí Tri thức ở Nơi Quyền năng. Cũng được tính điểm cuối ván.', en: 'Resource spent to pay Lore Costs at the Site of Power. It also scores at the end of the game.' } },
  { id: 'votes', group: 'res', en: 'Votes', forms: ['Votes', 'Vote'], vi: 'Phiếu',
    def: { vi: 'Phiếu của bạn trong một Hội đồng. Số Phiếu quyết định phần thưởng Hội đồng.', en: 'Your votes in a Council. The number of Votes decides the Council reward.' } },
  { id: 'strength', group: 'res', en: 'Strength', forms: ['Strength'], vi: 'Sức mạnh',
    def: { vi: 'Chỉ số của lá dùng trong Clash: tổng Sức mạnh cao nhất ở Vùng thì thắng, trừ khi có hiệu ứng thay đổi.', en: 'Value used in a Clash: the highest total Strength in a Region wins, unless an effect changes this.' } },
  { id: 'bid_strength', group: 'res', en: 'Bid Strength', forms: ['Bid Strength'], vi: 'Sức mạnh đấu giá',
    def: { vi: 'Sức mạnh của lá đấu giá khi Đấu giá. Phải vượt ngưỡng của thẻ đang đấu thì mới lấy được thẻ.', en: 'Strength of your bid card when Bidding. It must beat the card’s threshold to take the card.' } },
  { id: 'bidding', group: 'res', en: 'Bidding', forms: ['Bidding', 'Bid', 'Bids'], vi: 'Đấu giá',
    def: { vi: 'Cách lấy Thẻ Vương quốc: úp một lá làm lá đấu giá và so Sức mạnh đấu giá với ngưỡng của thẻ.', en: 'How Kingdom Cards are taken: place a face-down bid card and compare its Bid Strength with the card’s threshold.' } },
  { id: 'occupying', group: 'res', en: 'Occupying', forms: ['Occupying', 'Occupy', 'Occupies', 'Occupied'], vi: 'Chiếm giữ',
    def: { vi: 'Lá đặt lên một Thẻ Vương quốc để giữ thẻ đó. Lá này gọi là lá Chiếm giữ.', en: 'A card placed on a Kingdom Card to hold it. That card is called the Occupying card.' } },
  { id: 'steal', group: 'res', en: 'Steal', forms: ['Steal', 'steal', 'Steals', 'Stole', 'Stealing'], vi: 'Cướp',
    def: { vi: 'Lấy một Thẻ Vương quốc đang bị đối thủ Chiếm giữ, qua Đấu giá.', en: 'Take a Kingdom Card that an opponent is Occupying, through Bidding.' } },
  { id: 'supporter', group: 'res', en: 'Supporter', forms: ['Supporter', 'Supporters'], vi: 'Người ủng hộ',
    def: { vi: 'Lá hỗ trợ bạn ở một Vùng. Có thể được chuyển giữa các Vùng hoặc đưa về bảng của bạn.', en: 'A card that supports you in a Region. It can be moved between Regions or returned to your board.' } },
  { id: 'herald', group: 'res', en: 'Herald', forms: ['Herald', 'Heralds'], vi: 'Sứ giả',
    def: { vi: 'Quân của bạn, đặt trên một Địa điểm. Một số lá và Ân sủng dùng Sứ giả để kích hoạt hiệu ứng.', en: 'Your piece, placed on a Location. Some cards and Favours use the Herald to trigger effects.' } },

  // ---------------------------------------------------------------- Hành động, Lệnh & Đặc tính
  { id: 'journey', group: 'act', en: 'Journey', forms: ['Journey', 'Journeys', 'Journeying'], vi: 'Hành trình',
    def: { vi: 'Đưa một lá đi Hành trình để nhận Tri thức theo lá đó; lá về Thất lạc. Lá Dẫn đường về Bài bỏ thay vì Thất lạc.', en: 'Send a card on a Journey to gain Lore from it; the card goes to the Lost Pile. A Pathfinder card goes to the Discard Pile instead.' } },
  { id: 'acquire', group: 'act', en: 'Acquire', forms: ['Acquire', 'Acquires', 'Acquired'], vi: 'Nhận',
    def: { vi: 'Nhận một lá, thường là Thẻ Vương quốc từ Đại lộ hoặc Nơi Quyền năng.', en: 'Take a card, usually a Kingdom Card from the Great Road or the Site of Power.' } },
  { id: 'swap', group: 'act', en: 'Swap', forms: ['Swap', 'Swaps', 'Swapped'], vi: 'Hoán đổi',
    def: { vi: 'Đổi vị trí hai lá theo hiệu ứng.', en: 'Exchange the positions of two cards by an effect.' } },
  { id: 'exhausted', group: 'act', en: 'Exhausted', forms: ['Exhausted', 'Exhaust', 'Unexhaust', 'Unexhausted'], vi: 'Đã dùng',
    def: { vi: 'Trạng thái của Chiến thuật đã dùng. Làm mới (Unexhaust) để Chiến thuật dùng lại được.', en: 'State of a Tactic that has been used. Unexhaust (refresh) makes it usable again.' } },
  { id: 'setup', group: 'act', en: 'SETUP', forms: ['SETUP'], vi: 'CHUẨN BỊ',
    def: { vi: 'Hướng dẫn chuẩn bị in trên Chiến thuật: đặt Dấu theo thẻ trước khi dùng.', en: 'Setup instruction printed on a Tactic: place Markers as the card says before it is used.' } },
  { id: 'deadly', group: 'act', en: 'Deadly', forms: ['Deadly'], vi: 'Chí mạng', def: plain(COMMAND_DESC.deadly) },
  { id: 'ambush', group: 'act', en: 'Ambush', forms: ['Ambush', 'Ambushes'], vi: 'Phục kích', def: plain(COMMAND_DESC.ambush) },
  { id: 'retreat', group: 'act', en: 'Retreat', forms: ['Retreat', 'Retreats'], vi: 'Rút lui', def: plain(COMMAND_DESC.retreat) },
  { id: 'flank', group: 'act', en: 'Flank', forms: ['Flank', 'Flanks'], vi: 'Đánh sườn', def: plain(COMMAND_DESC.flank) },
  { id: 'rally', group: 'act', en: 'Rally', forms: ['Rally'], vi: 'Tập hợp', def: plain(COMMAND_DESC.rally) },
  { id: 'deploy', group: 'act', en: 'Deploy', forms: ['Deploy', 'Deploys', 'Deployed'], vi: 'Triển khai', def: plain(COMMAND_DESC.deploy) },
  { id: 'invulnerable', group: 'act', en: 'Invulnerable', forms: ['Invulnerable'], vi: 'Bất khả xâm phạm', def: plain(TRAIT_DESC.inv) },
  { id: 'resilient', group: 'act', en: 'Resilient', forms: ['Resilient'], vi: 'Kiên cường', def: plain(TRAIT_DESC.res) },
  { id: 'pathfinder', group: 'act', en: 'Pathfinder', forms: ['Pathfinder'], vi: 'Dẫn đường', def: plain(TRAIT_DESC.path) },

  // ---------------------------------------------------------------- Phe, Thẻ & Kiểu
  { id: 'faction', group: 'unit', en: 'Faction', forms: ['Faction', 'Factions'], vi: 'Phe',
    def: {
      vi: 'Một trong bốn phe: Quý tộc (Nobility), Nổi dậy (Uprising), Thị tộc (Clans), Tụ hội (Gathering). Lá Faction là các lá thuộc phe của bạn.',
      en: 'One of four factions: Nobility, Uprising, Clans, Gathering. Faction cards are the cards of your faction.',
    } },
  { id: 'kingdom_card', group: 'unit', en: 'Kingdom Card', forms: ['Kingdom Card', 'Kingdom Cards'], vi: 'Thẻ Vương quốc',
    def: {
      vi: 'Thẻ được đấu giá, cướp hoặc Cai trị trong trò chơi. Mỗi thẻ có một loại: Thánh vật (Relics), Bí mật (Secrets) hoặc Lời thề (Oaths).',
      en: 'Cards taken by Bidding, stolen or Governed during the game. Each has a suit: Relics, Secrets or Oaths.',
    } },
  { id: 'tactic', group: 'unit', en: 'Tactic', forms: ['Tactic', 'Tactics'], vi: 'Chiến thuật',
    def: {
      vi: 'Thẻ riêng của phe bạn, dùng khi điều kiện trên thẻ cho phép. Khi dùng, lật sang mặt Đã dùng (Exhausted).',
      en: 'Your faction’s own card, used when its text allows. When used, it flips to the Exhausted side.',
    } },
  { id: 'kingdoms_favour', group: 'unit', en: 'Kingdom’s Favour', forms: ['Kingdom’s Favour', 'Kingdom\'s Favour'], vi: 'Ân sủng Vương quốc',
    def: {
      vi: 'Năng lực riêng của mỗi phe: Regal Guard (Quý tộc), Spy Network (Nổi dậy), Prophet of the Waves (Thị tộc), Herald of the Moon (Tụ hội).',
      en: 'Each faction’s own power: Regal Guard (Nobility), Spy Network (Uprising), Prophet of the Waves (Clans), Herald of the Moon (Gathering).',
    } },
  { id: 'archetype', group: 'unit', en: 'Archetype', forms: ['Archetype', 'Archetypes'], vi: 'Kiểu',
    def: {
      vi: 'Vai trò của lá Faction (Người thừa kế, Mật vụ, Đội trưởng, ...). Kiểu quyết định Sức mạnh và khả năng cơ bản của lá.',
      en: 'The role of a Faction card (Heir, Agent, Captain, ...). The Archetype sets the card’s basic Strength and abilities.',
    } },
  { id: 'heir', group: 'unit', en: 'Heir', forms: ['Heir', 'Heirs'], vi: 'Người thừa kế', def: role(ARCH_DESC.heir) },
  { id: 'agent', group: 'unit', en: 'Agent', forms: ['Agent', 'Agents'], vi: 'Mật vụ', def: role(ARCH_DESC.agent) },
  { id: 'captain', group: 'unit', en: 'Captain', forms: ['Captain', 'Captains'], vi: 'Đội trưởng', def: role(ARCH_DESC.captain) },
  { id: 'cavalry', group: 'unit', en: 'Cavalry', forms: ['Cavalry'], vi: 'Kỵ binh', def: role(ARCH_DESC.cavalry) },
  { id: 'champion', group: 'unit', en: 'Champion', forms: ['Champion', 'Champions'], vi: 'Nhà vô địch',
    def: {
      vi: 'Kiểu cao cấp với Sức mạnh 11. Một số thẻ như Moonshine Cove cho phép nhận lá bằng Đội trưởng hoặc Nhà vô địch.',
      en: 'High-tier Archetype with Strength 11. Some cards, such as Moonshine Cove, let you acquire a card with a Captain or Champion.',
    } },
  { id: 'follower', group: 'unit', en: 'Follower', forms: ['Follower', 'Followers'], vi: 'Tùy tùng', def: role(ARCH_DESC.follower) },
  { id: 'ruse', group: 'unit', en: 'Ruse', forms: ['Ruse'], vi: 'Mưu kế', def: role(ARCH_DESC.ruse) },
  { id: 'trader', group: 'unit', en: 'Trader', forms: ['Trader', 'Traders'], vi: 'Thương nhân', def: role(ARCH_DESC.trader) },
  { id: 'war_machine', group: 'unit', en: 'War Machine', forms: ['War Machine', 'War Machines'], vi: 'Máy chiến', def: role(ARCH_DESC.warmachine) },
];

// Lookup for the tooltips and the bold marks: lower-cased English spelling -> entry.
export const GLOSSARY_BY_FORM = new Map(GLOSSARY.flatMap((e) => e.forms.map((f) => [f.toLowerCase(), e])));
