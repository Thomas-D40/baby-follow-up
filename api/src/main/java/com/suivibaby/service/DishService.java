package com.suivibaby.service;

import com.suivibaby.mapper.DishMapper;
import com.suivibaby.model.DishSearchResponse;
import com.suivibaby.repository.DishRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class DishService {

    private static final int SEARCH_LIMIT = 10;

    @Inject
    DishRepository dishRepository;

    @Inject
    DishMapper dishMapper;

    public DishSearchResponse search(String q) {
        String normalized = q == null ? "" : DishLabels.normalize(q);
        if (normalized.isEmpty()) {
            return new DishSearchResponse(List.of(), false);
        }
        boolean exactMatch = DishLabels.isFixed(normalized)
                || dishRepository.findByNormalizedLabel(normalized) != null;
        return new DishSearchResponse(dishMapper.toResponses(dishRepository.search(normalized, SEARCH_LIMIT)),
                exactMatch);
    }

    // Called from the meal creation, in its transaction and after its validations: a refused meal
    // adds nothing. Purée and Compote are never stored (D18-N).
    public void addIfAbsent(UUID authorId, String label) {
        String normalized = DishLabels.normalize(label);
        if (DishLabels.isFixed(normalized)) {
            return;
        }
        dishRepository.insertIfAbsent(UUID.randomUUID(), label, normalized, authorId);
    }
}
