package com.suivibaby.mapper;

import com.suivibaby.model.BottleFeedingResponse;
import com.suivibaby.model.CalendarEventResponse;
import com.suivibaby.model.CalendarEventType;
import com.suivibaby.model.NapResponse;
import com.suivibaby.model.StoolResponse;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * Projette les réponses typées des sous-ressources vers la projection unifiée du calendrier (Épic 6,
 * D6-H). Invoqué par {@code CalendarService} après agrégation : chaque type ne remplit que ses propres
 * champs, les autres restent {@code null}.
 */
@ApplicationScoped
public class CalendarMapper {

    /** Biberon → point ({@code startAt = occurredAt}, {@code endAt = null}). */
    public CalendarEventResponse fromBottle(BottleFeedingResponse event) {
        return new CalendarEventResponse(CalendarEventType.bottle_feeding, event.id(), event.occurredAt(),
                null, event.authorId(), event.quantityMl(), event.milkType(), null);
    }

    /** Sieste → intervalle ({@code endAt = null} = en cours). */
    public CalendarEventResponse fromNap(NapResponse nap) {
        return new CalendarEventResponse(CalendarEventType.nap, nap.id(), nap.startAt(), nap.endAt(),
                nap.authorId(), null, null, null);
    }

    /** Selle → point ({@code startAt = occurredAt}, {@code endAt = null}). */
    public CalendarEventResponse fromStool(StoolResponse event) {
        return new CalendarEventResponse(CalendarEventType.stool, event.id(), event.occurredAt(),
                null, event.authorId(), null, null, event.consistency());
    }
}
