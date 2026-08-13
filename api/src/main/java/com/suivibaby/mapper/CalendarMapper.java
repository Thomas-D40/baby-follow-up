package com.suivibaby.mapper;

import com.suivibaby.model.BottleFeedingResponse;
import com.suivibaby.model.CalendarEventResponse;
import com.suivibaby.model.CalendarEventType;
import com.suivibaby.model.NapResponse;
import com.suivibaby.model.StoolResponse;
import com.suivibaby.model.UrineResponse;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class CalendarMapper {

    public CalendarEventResponse fromBottle(BottleFeedingResponse event) {
        return new CalendarEventResponse(CalendarEventType.bottle_feeding, event.id(), event.occurredAt(),
                null, event.authorId(), event.quantityMl(), event.milkType(), null);
    }

    public CalendarEventResponse fromNap(NapResponse nap) {
        return new CalendarEventResponse(CalendarEventType.nap, nap.id(), nap.startAt(), nap.endAt(),
                nap.authorId(), null, null, null);
    }

    public CalendarEventResponse fromStool(StoolResponse event) {
        return new CalendarEventResponse(CalendarEventType.stool, event.id(), event.occurredAt(),
                null, event.authorId(), null, null, event.consistency());
    }

    public CalendarEventResponse fromUrine(UrineResponse event) {
        return new CalendarEventResponse(CalendarEventType.urine, event.id(), event.occurredAt(),
                null, event.authorId(), null, null, null);
    }
}
