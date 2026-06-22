package com.suivibaby.mapper;

import com.suivibaby.entity.Nap;
import com.suivibaby.model.NapResponse;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class NapMapper {

    public NapResponse toResponse(Nap nap) {
        return new NapResponse(nap.id, nap.startAt, nap.endAt, nap.authorId);
    }

    public List<NapResponse> toResponses(List<Nap> naps) {
        return naps.stream().map(this::toResponse).toList();
    }
}
