import React from 'react';
import { Banner } from './Primitives';
import { BOOKING_OPENS_LABEL } from '../data/calendar';

/**
 * Spec 5 / contract 9.2: before the Oct 10 gate a token family sees the
 * schedule with Reserve inert and this line; Elite never sees it. One
 * component so BookSession and SpecialistBooking cannot word it differently.
 */
export default function BookingOpensBanner({ style }) {
  return (
    <Banner tone="yellow" title="Not open yet" style={style}>
      Booking opens {BOOKING_OPENS_LABEL}
    </Banner>
  );
}
