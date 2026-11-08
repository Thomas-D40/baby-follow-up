package com.suivibaby.mapper;

import com.suivibaby.entity.SolidMeal;
import com.suivibaby.model.SolidMealResponse;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class SolidMealMapper {

    public SolidMealResponse toResponse(SolidMeal event) {
        return new SolidMealResponse(event.id, event.occurredAt, event.dish, event.portion, event.authorId);
    }

    public List<SolidMealResponse> toResponses(List<SolidMeal> events) {
        return events.stream().map(this::toResponse).toList();
    }
}
