package com.suivibaby.mapper;

import com.suivibaby.entity.Weight;
import com.suivibaby.model.WeightHistoryResponse;
import com.suivibaby.model.WeightPoint;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class WeightMapper {

    /**
     * Projette l'historique complet (déjà trié given_on ASC par le repo) en réponse de lecture.
     * Un seul payload sert la liste ET la courbe (D12-D′) — projection triviale conservée par
     * convention (mappers dédiés appelés par le service).
     */
    public WeightHistoryResponse toHistoryResponse(List<Weight> rows) {
        List<WeightPoint> points = rows.stream()
                .map(w -> new WeightPoint(w.givenOn, w.weightGrams))
                .toList();
        return new WeightHistoryResponse(points);
    }
}
