package com.suivibaby.mapper;

import com.suivibaby.entity.Temperature;
import com.suivibaby.model.TemperatureResponse;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class TemperatureMapper {

    public TemperatureResponse toResponse(Temperature event) {
        return new TemperatureResponse(event.id, event.occurredAt, event.temperatureCelsiusX10, event.authorId);
    }

    public List<TemperatureResponse> toResponses(List<Temperature> events) {
        return events.stream().map(this::toResponse).toList();
    }
}
