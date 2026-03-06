import { useParams } from "react-router-dom";

const Summary = () => {
  const { tripId } = useParams();
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">Trip Summary</h1>
        <p className="mt-2 text-muted-foreground">Trip ID: {tripId}</p>
      </div>
    </div>
  );
};

export default Summary;
