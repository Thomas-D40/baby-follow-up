package com.suivibaby.mapper;

import com.suivibaby.entity.MedicalCare;
import com.suivibaby.model.MedicalCareResponse;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class MedicalCareMapper {

    public MedicalCareResponse toResponse(MedicalCare event) {
        return new MedicalCareResponse(event.id, event.occurredAt, event.careType, event.authorId);
    }

    public List<MedicalCareResponse> toResponses(List<MedicalCare> events) {
        return events.stream().map(this::toResponse).toList();
    }
}
