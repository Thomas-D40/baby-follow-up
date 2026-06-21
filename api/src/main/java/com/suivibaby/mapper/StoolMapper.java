package com.suivibaby.mapper;

import com.suivibaby.entity.Stool;
import com.suivibaby.model.StoolResponse;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

/** Mappe les entités {@link Stool} vers leur projection web. Invoqué depuis le service. */
@ApplicationScoped
public class StoolMapper {

    public StoolResponse toResponse(Stool event) {
        return new StoolResponse(event.id, event.occurredAt, event.consistency, event.authorId);
    }

    public List<StoolResponse> toResponses(List<Stool> events) {
        return events.stream().map(this::toResponse).toList();
    }
}
