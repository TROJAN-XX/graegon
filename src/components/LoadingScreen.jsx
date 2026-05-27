function LoadingScreen({ text = "Loading..." }) {
  return (
    <div className="waiting-page">
      <div className="waiting-card loading-card">
        <div className="loading-spinner"></div>
        <h1>{text}</h1>
      </div>
    </div>
  );
}

export default LoadingScreen;
