package com.suivibaby.mapper;

import com.suivibaby.entity.BottleFeeding;
import com.suivibaby.model.BottleFeedingResponse;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class BottleFeedingMapper {

    public BottleFeedingResponse toResponse(BottleFeeding event) {
        return new BottleFeedingResponse(event.id, event.occurredAt, event.quantityMl, event.milkType,
                event.authorId);
    }

    public List<BottleFeedingResponse> toResponses(List<BottleFeeding> events) {
        return events.stream().map(this::toResponse).toList();
    }
}
