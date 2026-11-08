package com.suivibaby.mapper;

import com.suivibaby.entity.Breastfeeding;
import com.suivibaby.model.BreastfeedingResponse;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class BreastfeedingMapper {

    public BreastfeedingResponse toResponse(Breastfeeding event) {
        return new BreastfeedingResponse(event.id, event.occurredAt, event.side, event.durationMinutes,
                event.authorId);
    }

    public List<BreastfeedingResponse> toResponses(List<Breastfeeding> events) {
        return events.stream().map(this::toResponse).toList();
    }
}
