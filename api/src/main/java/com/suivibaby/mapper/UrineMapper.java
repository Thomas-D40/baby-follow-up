package com.suivibaby.mapper;

import com.suivibaby.entity.Urine;
import com.suivibaby.model.UrineResponse;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class UrineMapper {

    public UrineResponse toResponse(Urine event) {
        return new UrineResponse(event.id, event.occurredAt, event.authorId);
    }

    public List<UrineResponse> toResponses(List<Urine> events) {
        return events.stream().map(this::toResponse).toList();
    }
}
