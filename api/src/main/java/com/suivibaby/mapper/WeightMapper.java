package com.suivibaby.mapper;

import com.suivibaby.entity.Weight;
import com.suivibaby.model.WeightHistoryResponse;
import com.suivibaby.model.WeightPoint;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class WeightMapper {

    // Projects the full history (already sorted given_on ASC by the repo) into the read response.
    // A single payload serves both the list AND the curve (D12-D′) — trivial projection kept by
    // convention (dedicated mappers called by the service).
    public WeightHistoryResponse toHistoryResponse(List<Weight> rows) {
        List<WeightPoint> points = rows.stream()
                .map(w -> new WeightPoint(w.givenOn, w.weightGrams))
                .toList();
        return new WeightHistoryResponse(points);
    }
}
