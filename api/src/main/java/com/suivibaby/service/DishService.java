package com.suivibaby.service;

import com.suivibaby.entity.AppUser;
import com.suivibaby.entity.Dish;
import com.suivibaby.mapper.DishMapper;
import com.suivibaby.model.DishResponse;
import com.suivibaby.model.DishSearchResponse;
import com.suivibaby.model.RenameDishRequest;
import com.suivibaby.repository.DishRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class DishService {

    // The merge of the dish suggestions needs the shared search to return at least as many dishes as
    // it may show.
    private static final int SEARCH_LIMIT = DishSuggestions.MAX_SUGGESTIONS;

    @Inject
    DishRepository dishRepository;

    @Inject
    DishMapper dishMapper;

    public DishSearchResponse search(String q) {
        String normalized = q == null ? "" : DishLabels.normalize(q);
        if (normalized.isEmpty()) {
            return new DishSearchResponse(List.of(), false);
        }
        boolean exactMatch = dishRepository.findByNormalizedLabel(normalized) != null;
        return new DishSearchResponse(dishMapper.toResponses(dishRepository.search(normalized, SEARCH_LIMIT)),
                exactMatch);
    }

    // Called from the meal creation, in its transaction and after its validations: a refused meal
    // adds nothing.
    public void addIfAbsent(UUID authorId, String label) {
        String normalized = DishLabels.normalize(label);
        dishRepository.insertIfAbsent(UUID.randomUUID(), label, normalized, authorId);
    }

    // The server decides what the screen shows: the front never reads the role (D18-AI).
    public List<DishResponse> getManageableDishes(AppUser currentUser) {
        List<Dish> dishes = isAdmin(currentUser)
                ? dishRepository.listAllSorted()
                : dishRepository.listByAuthor(currentUser.id);
        return dishMapper.toResponses(dishes);
    }

    // Checks run in this order: existence, right, validation, uniqueness (D18-AH).
    @Transactional
    public DishResponse rename(AppUser currentUser, UUID id, RenameDishRequest request) {
        Dish dish = requireManageable(currentUser, id);
        String label = DishLabels.validate(request == null ? null : request.label());
        String normalized = DishLabels.normalize(label);
        Dish sameLabel = dishRepository.findByNormalizedLabel(normalized);
        // A variant of the dish's own label (case, accents, blanks) is a correction, not a clash.
        boolean clashesWithAnotherDish = sameLabel != null && !sameLabel.id.equals(dish.id);
        if (clashesWithAnotherDish) {
            throw new ClientErrorException("Ce plat existe déjà.", Response.Status.CONFLICT);
        }
        dish.label = label;
        dish.normalizedLabel = normalized;
        return dishMapper.toResponse(dish); // managed entity flushed at commit
    }

    @Transactional
    public void delete(AppUser currentUser, UUID id) {
        requireManageable(currentUser, id);
        dishRepository.deleteById(id);
    }

    // 404 for an unknown dish; 403 (not 404) for someone else's: every dish is visible to everybody
    // through the search, so hiding it would be a lie (D18-AH). A dish whose author was deleted has no
    // author left: only the admin manages it (D24-X).
    private Dish requireManageable(AppUser currentUser, UUID id) {
        Dish dish = dishRepository.findById(id);
        if (dish == null) {
            throw new NotFoundException();
        }
        if (!isAdmin(currentUser) && !currentUser.id.equals(dish.authorId)) {
            throw new ForbiddenException("Action réservée à l'auteur du plat.");
        }
        return dish;
    }

    private boolean isAdmin(AppUser currentUser) {
        return "admin".equals(currentUser.role);
    }
}
