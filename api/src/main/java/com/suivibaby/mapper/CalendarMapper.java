package com.suivibaby.mapper;

import com.suivibaby.model.BottleFeedingResponse;
import com.suivibaby.model.CalendarEventResponse;
import com.suivibaby.model.CalendarEventType;
import com.suivibaby.model.MedicalCareResponse;
import com.suivibaby.model.NapResponse;
import com.suivibaby.model.StoolResponse;
import com.suivibaby.model.TemperatureResponse;
import com.suivibaby.model.UrineResponse;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class CalendarMapper {

    public CalendarEventResponse fromBottle(BottleFeedingResponse event) {
        return new CalendarEventResponse(CalendarEventType.bottle_feeding, event.id(), event.occurredAt(),
                null, event.authorId(), event.quantityMl(), event.milkType(), null, null);
    }

    public CalendarEventResponse fromNap(NapResponse nap) {
        return new CalendarEventResponse(CalendarEventType.nap, nap.id(), nap.startAt(), nap.endAt(),
                nap.authorId(), null, null, null, null);
    }

    public CalendarEventResponse fromStool(StoolResponse event) {
        return new CalendarEventResponse(CalendarEventType.stool, event.id(), event.occurredAt(),
                null, event.authorId(), null, null, event.consistency(), null);
    }

    public CalendarEventResponse fromUrine(UrineResponse event) {
        return new CalendarEventResponse(CalendarEventType.urine, event.id(), event.occurredAt(),
                null, event.authorId(), null, null, null, null);
    }

    public CalendarEventResponse fromTemperature(TemperatureResponse event) {
        return new CalendarEventResponse(CalendarEventType.temperature, event.id(), event.occurredAt(),
                null, event.authorId(), null, null, null, event.temperatureCelsiusX10());
    }

    // The single back-side translation point between the STORAGE vocabulary (care_type eye|nose) and
    // the PRESENTATION vocabulary (calendar types eye_care|nose_care) — D15-F′ / K1. The front holds
    // the symmetrical mapping when it edits a care row: eye_care -> eye before the PATCH.
    public CalendarEventResponse fromMedicalCare(MedicalCareResponse event) {
        CalendarEventType type = switch (event.careType()) {
            case eye -> CalendarEventType.eye_care;
            case nose -> CalendarEventType.nose_care;
        };
        return new CalendarEventResponse(type, event.id(), event.occurredAt(),
                null, event.authorId(), null, null, null, null);
    }
}
