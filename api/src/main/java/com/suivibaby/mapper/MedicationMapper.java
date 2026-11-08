package com.suivibaby.mapper;

import com.suivibaby.entity.Medication;
import com.suivibaby.model.MedicationResponse;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class MedicationMapper {

    public MedicationResponse toResponse(Medication event) {
        return new MedicationResponse(event.id, event.occurredAt, event.medicationName, event.dosage,
                event.authorId);
    }

    public List<MedicationResponse> toResponses(List<Medication> events) {
        return events.stream().map(this::toResponse).toList();
    }
}
