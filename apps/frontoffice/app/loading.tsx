export default function Loading() {
  return (
    <main className="routeLoading" aria-busy="true">
      <p className="srOnly" role="status">Loading available cars</p>

      <div className="loadingHeader loadingSkeleton" aria-hidden="true" />

      <section className="loadingHeroShell" aria-hidden="true">
        <div className="loadingHeroCopy">
          <span className="loadingKicker loadingSkeleton" />
          <span className="loadingTitle loadingSkeleton" />
          <span className="loadingTitle short loadingSkeleton" />
          <span className="loadingText loadingSkeleton" />
          <span className="loadingAction loadingSkeleton" />
        </div>
        <div className="loadingHeroImage loadingSkeleton" />
      </section>

      <div className="loadingSearchRail" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <span className="loadingField loadingSkeleton" key={index} />
        ))}
        <span className="loadingButton loadingSkeleton" />
      </div>

      <section className="loadingInventoryShell" aria-hidden="true">
        <span className="loadingSectionTitle loadingSkeleton" />
        <div className="loadingCardGrid">
          {Array.from({ length: 3 }).map((_, index) => (
            <span className="loadingCard loadingSkeleton" key={index} />
          ))}
        </div>
      </section>
    </main>
  );
}
