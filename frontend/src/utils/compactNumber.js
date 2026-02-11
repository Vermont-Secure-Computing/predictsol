export function formatCompactNumber(num) {
    if (!num || num === 0) return "0";
  
    if (num < 0.0001) return num.toFixed(9).replace(/\.?0+$/, "");
  
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  
    return num.toFixed(4).replace(/\.?0+$/, "");
  }
  