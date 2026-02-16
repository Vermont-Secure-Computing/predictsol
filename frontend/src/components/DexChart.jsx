

const DexChart = ({ chainId = "solana", pairAddress }) => {
  const url = `https://dexscreener.com/solana/${pairAddress}?embed=1&theme=dark&info=0`;
  console.log("dex url: ", url)

  return (
    <div style={{
      width: '100%',
      height: '300px', 
      overflow: 'hidden',
      position: 'relative',
      background: '#000',
      borderRadius: '12px'
    }}>
      <iframe
        src={url}
        style={{
          position: 'absolute',
          top: '-65px', 
          left: '-1px',
          width: 'calc(100% + 2px)',
          height: 'calc(100% + 65px)',
          border: 'none'
        }}
        title="Token Chart"
      />
    </div>
  );
};

// Usage:
// <DexScreenerPureChart pairAddress="BRPA7FGTiquANwoVxFQYaS5UfdvrQJEMpCGAs4ZSHi3Z" />

export default DexChart;
