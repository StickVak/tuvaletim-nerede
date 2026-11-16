const avg = (nums) => nums.reduce((s, n) => s + n, 0) / nums.length;
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Oylardan puan ve ücret durumunu hesaplar.
 * Ücret durumu oyların çoğunluğudur; oy yoksa veya eşitse tür varsayılanı (AVM ücretsiz, diğerleri ücretli).
 */
export function computeStats(category, votes) {
  const paid = votes.filter((v) => v.is_paid);
  const free = votes.length - paid.length;
  const isPaid = paid.length === free ? category !== 'avm' : paid.length > free;
  const prices = paid.map((v) => v.price_amount).filter((p) => p > 0);
  const cleanliness = votes.length ? avg(votes.map((v) => v.cleanliness)) : 0;
  const comfort = votes.length ? avg(votes.map((v) => v.comfort)) : 0;
  return {
    voteCount: votes.length,
    cleanliness,
    comfort,
    rating: votes.length ? (cleanliness + comfort) / 2 : 0,
    isPaid,
    avgPrice: isPaid && prices.length ? round1(avg(prices)) : null,
  };
}
