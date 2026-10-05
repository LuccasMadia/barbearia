import { getActiveServices, getActiveBarbers } from "@/lib/site-data";
import { BookingWizard } from "@/components/booking/BookingWizard";

export default async function AgendarPage() {
  const [services, barbers] = await Promise.all([
    getActiveServices(),
    getActiveBarbers(),
  ]);

  return <BookingWizard services={services} barbers={barbers} />;
}
